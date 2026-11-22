// Biblioteca General: búsqueda, filtros, orden, secciones tipo Netflix y página pública del quiz.
//
// Rendimiento:
//  • Búsqueda full-text de PostgreSQL (tsvector + GIN) y trigramas para errores de escritura.
//  • Paginación por cursor ("keyset"): nunca OFFSET; cada página cuesta lo mismo.
//  • Primero se obtienen solo los ids ordenados (consulta ligera) y luego se hidratan las tarjetas.
//  • Las secciones se cachean en Redis.
import 'server-only';
import { createHash } from 'node:crypto';
import { db, dbRead, Prisma } from '@quiz-rush/db';
import {
  DURATION_BUCKETS,
  stableStringify,
  normalizeAnswer,
  type LibraryQuery,
  type LibrarySort,
  type QuestionType,
} from '@quiz-rush/shared';
import { bumpVersion, cached, cachedMany, cacheVersion, memo, runAtMostEvery } from './cache';
import { workerAlive } from './jobs';
import { refreshSearchScores, searchEngineEnabled, searchIds } from './search';

// ───────────────────────────── Tarjetas ─────────────────────────────

export interface QuizCardData {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  theme: string;
  category: string | null;
  language: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  questionCount: number;
  durationSec: number;
  questionTypes: QuestionType[];
  playCount: number;
  favoriteCount: number;
  ratingAvg: number;
  ratingCount: number;
  publishedAt: Date | null;
  firstQuestion: string | null;
  author: { username: string; displayName: string };
}

const cardSelect = {
  id: true,
  title: true,
  description: true,
  coverUrl: true,
  theme: true,
  category: true,
  language: true,
  difficulty: true,
  questionCount: true,
  durationSec: true,
  questionTypes: true,
  playCount: true,
  favoriteCount: true,
  ratingAvg: true,
  ratingCount: true,
  publishedAt: true,
  author: { select: { profile: { select: { username: true, displayName: true } } } },
  questions: { select: { prompt: true }, orderBy: { position: 'asc' }, take: 1 },
} satisfies Prisma.QuizSelect;

type CardRow = Prisma.QuizGetPayload<{ select: typeof cardSelect }>;

function toCard(row: CardRow): QuizCardData {
  const { author, questions, ...rest } = row;
  return {
    ...rest,
    firstQuestion: questions[0]?.prompt ?? null,
    author: {
      username: author.profile?.username ?? '',
      displayName: author.profile?.displayName ?? '—',
    },
  };
}

/** Hidrata tarjetas conservando el orden de los ids (siempre desde la base de datos). */
export async function cardsByIds(ids: string[]): Promise<QuizCardData[]> {
  if (ids.length === 0) return [];
  const rows = await dbRead.quiz.findMany({ where: { id: { in: ids } }, select: cardSelect });
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.map((id) => byId.get(id)).filter((c): c is QuizCardData => !!c);
}

/**
 * Tarjetas para las búsquedas: cada una se guarda 30 s en Redis (`card:<id>`) y 5 s en memoria,
 * y se borra en cuanto cambia algo que muestra (ver `invalidate` en lib/cache.ts; en otras
 * réplicas la copia en memoria puede ir hasta 5 s por detrás). Solo quizzes visibles: un
 * id que venga de una búsqueda en caché y ya esté borrado u oculto no aparece.
 */
async function searchCards(ids: string[]): Promise<QuizCardData[]> {
  const found = await cachedMany(
    ids.map((id) => `card:${id}`),
    30,
    async (missing) => {
      const rows = await dbRead.quiz.findMany({
        where: {
          id: { in: missing.map((k) => k.slice(5)) },
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          deletedAt: null,
        },
        select: cardSelect,
      });
      return new Map(rows.map((r) => [`card:${r.id}`, toCard(r)]));
    },
    // 5 s en memoria: casi ninguna búsqueda va a Redis por las tarjetas
    { memoryMs: 5000 },
  );
  return ids.map((id) => found.get(`card:${id}`)).filter((c): c is QuizCardData => !!c);
}

// ───────────────────────────── Búsqueda ─────────────────────────────

/** Condición común: solo quizzes publicados, públicos y no borrados. */
const VISIBLE = Prisma.sql`q."status" = 'PUBLISHED' AND q."visibility" = 'PUBLIC' AND q."deletedAt" IS NULL`;

interface Cursor {
  v: number | string;
  id: string;
}

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(raw?: string): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Cursor;
    return typeof c.id === 'string' && (typeof c.v === 'number' || typeof c.v === 'string')
      ? c
      : null;
  } catch {
    return null;
  }
}

/**
 * Convierte el texto del usuario en una consulta tsquery segura con prefijos:
 * "sistema sol" → "sistema:* & sol:*" (búsqueda instantánea mientras se escribe).
 */
function toPrefixTsQuery(text: string): string | null {
  const tokens = normalizeAnswer(text)
    .split(' ')
    .map((t) => t.replace(/[^\p{Letter}\p{Number}]/gu, ''))
    .filter(Boolean)
    .slice(0, 8);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(' & ') : null;
}

/** Marca de los cursores que vienen de Meilisearch (el valor es el desplazamiento). */
const MEILI_CURSOR = '~meili';

export interface LibraryPage {
  items: QuizCardData[];
  nextCursor: string | null;
}

interface SearchIds {
  ids: string[];
  nextCursor: string | null;
}

/**
 * Búsqueda con caché compartida (60 s) de lo caro: QUÉ quizzes salen y en qué orden. La misma
 * consulta de miles de personas solo llega una vez a la base de datos. La clave incluye la
 * versión del grupo `library` (sube al publicar, ocultar o borrar un quiz y al recalcular la
 * tendencia). Las tarjetas van aparte (searchCards): se refrescan en cuanto cambian sus
 * contadores y un quiz recién borrado u oculto nunca aparece.
 */
export async function searchLibrary(query: LibraryQuery): Promise<LibraryPage> {
  const v = await cacheVersion('library');
  const key = createHash('sha1').update(stableStringify(query)).digest('base64url');
  // 2 s en memoria de la búsqueda ya montada: con mucha carga, la mayoría ni va a Redis
  return memo(`page:search:v${v}:${key}`, 2000, async () => {
    const page = await cached(`library:search:v${v}:${key}`, 60, () => searchIdsUncached(query));
    return { items: await searchCards(page.ids), nextCursor: page.nextCursor };
  });
}

async function searchIdsUncached(query: LibraryQuery): Promise<SearchIds> {
  const limit = query.limit ?? 24;
  const text = query.q?.trim() || '';
  const tsq = text ? toPrefixTsQuery(text) : null;
  const sort: LibrarySort = query.sort ?? (tsq ? 'relevance' : 'trending');

  // Buscador externo (opcional): búsquedas con texto ordenadas por relevancia
  if (tsq && sort === 'relevance' && searchEngineEnabled()) {
    const c = decodeCursor(query.cursor);
    const offset = c?.id === MEILI_CURSOR ? Number(c.v) : 0;
    const b = (query.duration ? DURATION_BUCKETS[query.duration] : {}) as {
      min?: number;
      max?: number;
    };
    const hit = await searchIds({
      text,
      category: query.category,
      language: query.language,
      difficulty: query.difficulty,
      type: query.type,
      durationMin: b.min,
      durationMax: b.max,
      offset,
      limit,
    });
    if (hit) {
      return {
        ids: hit.ids,
        nextCursor: hit.hasMore ? encodeCursor({ v: offset + limit, id: MEILI_CURSOR }) : null,
      };
    }
  }

  // Filtros
  const where: Prisma.Sql[] = [VISIBLE];
  if (query.category) where.push(Prisma.sql`q."category" = ${query.category}`);
  if (query.language) where.push(Prisma.sql`q."language" = ${query.language}`);
  if (query.difficulty) where.push(Prisma.sql`q."difficulty" = ${query.difficulty}::"Difficulty"`);
  if (query.type)
    where.push(Prisma.sql`q."questionTypes" @> ARRAY[${query.type}]::"QuestionType"[]`);
  if (query.duration) {
    const b = DURATION_BUCKETS[query.duration] as { min?: number; max?: number };
    if (b.min !== undefined) where.push(Prisma.sql`q."durationSec" >= ${b.min}`);
    if (b.max !== undefined) where.push(Prisma.sql`q."durationSec" < ${b.max}`);
  }

  const unaccentText = Prisma.sql`immutable_unaccent(lower(${text}))`;
  if (tsq) {
    // Coincidencia por palabras (con prefijos) O parte del título parecida (tolerancia a errores:
    // word_similarity compara con el fragmento del título que mejor encaja, no con el título entero)
    where.push(Prisma.sql`(
      q."searchVector" @@ to_tsquery('simple', immutable_unaccent(${tsq}))
      OR ${unaccentText} <% immutable_unaccent(lower(q."title"))
    )`);
  }

  // Expresión de orden según el criterio elegido
  const sortExpr: Record<LibrarySort, Prisma.Sql> = {
    trending: Prisma.sql`q."trendingScore"`,
    popular: Prisma.sql`q."playCount"::float8`,
    top: Prisma.sql`q."ratingScore"`,
    new: Prisma.sql`extract(epoch from q."publishedAt")`,
    relevance: tsq
      ? Prisma.sql`(
          ts_rank_cd(q."searchVector", to_tsquery('simple', immutable_unaccent(${tsq})))
          + word_similarity(${unaccentText}, immutable_unaccent(lower(q."title")))
          + ln(q."playCount" + 2) * 0.01
        )`
      : Prisma.sql`q."trendingScore"`,
  };
  const expr = sortExpr[sort];

  // Paginación por cursor: (valor, id) estrictamente menor que el último de la página anterior
  const rawCursor = decodeCursor(query.cursor);
  // Un cursor de Meilisearch no sirve en Postgres (si el buscador se cayó, se empieza de nuevo)
  const cursor = rawCursor?.id === MEILI_CURSOR ? null : rawCursor;
  if (cursor)
    where.push(Prisma.sql`(${expr}, q."id") < (${Number(cursor.v)}::float8, ${cursor.id})`);

  // El umbral de parecido del operador <% (0,45) está fijado en la base de datos (migración
  // trgm_threshold): sin transacción por búsqueda, que agotaba las conexiones con mucha carga.
  const rows = await dbRead.$queryRaw<{ id: string; sortValue: number }[]>`
    SELECT q."id", (${expr})::float8 AS "sortValue"
    FROM "Quiz" q
    WHERE ${Prisma.join(where, ' AND ')}
    ORDER BY 2 DESC, q."id" DESC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    ids: page.map((r) => r.id),
    nextCursor: hasMore && last ? encodeCursor({ v: last.sortValue, id: last.id }) : null,
  };
}

// ───────────────────────────── Secciones ─────────────────────────────

/**
 * Recalcula la puntuación de tendencia de todos los quizzes publicados.
 * Misma fórmula que `trendingScore()` en packages/shared. La ejecuta el worker cada 10 min.
 */
export function refreshTrending() {
  return db.$executeRaw`
      UPDATE "Quiz" SET "trendingScore" =
        ("playCount" + 3 * "favoriteCount" + 2 * "ratingCount" * ("ratingAvg" / 5) + 1.5 * "commentCount" + 1)
        / power(extract(epoch from (now() - coalesce("publishedAt", "createdAt"))) / 3600 + 2, 1.5)
      WHERE "status" = 'PUBLISHED' AND "deletedAt" IS NULL
    `;
}

/** Tendencia + cifras del buscador externo (si lo hay). Devuelve los quizzes recalculados. */
export async function refreshTrendingAndSearch() {
  const n = await refreshTrending();
  await bumpVersion('library');
  await refreshSearchScores().catch((err) =>
    console.error('[búsqueda] no se pudieron actualizar las cifras:', (err as Error).message),
  );
  return n;
}

/** Respaldo sin worker: la Biblioteca lo dispara al visitarse (como mucho cada 10 min). */
export async function maybeRefreshTrending() {
  if (await workerAlive()) return;
  await runAtMostEvery('trending-refresh', 600, refreshTrendingAndSearch);
}

export interface FeaturedCreator {
  username: string;
  displayName: string;
  bio: string | null;
  followersCount: number;
  quizzes: number;
  plays: number;
}

export async function getLibrarySections() {
  const v = await cacheVersion('library');
  return cached(`library:sections:v${v}`, 60, async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [trending, newIds, topRated, popular] = await Promise.all([
      searchLibrary({ sort: 'trending', limit: 12 }),
      dbRead.quiz.findMany({
        where: {
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          deletedAt: null,
          publishedAt: { gte: weekAgo },
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 12,
        select: { id: true },
      }),
      searchLibrary({ sort: 'top', limit: 12 }),
      searchLibrary({ sort: 'popular', limit: 12 }),
    ]);
    return {
      trending: trending.items,
      newThisWeek: await cardsByIds(newIds.map((q) => q.id)),
      topRated: topRated.items,
      popular: popular.items,
    };
  });
}

export async function getFeaturedCreators(): Promise<FeaturedCreator[]> {
  return cached('library:creators:v1', 300, async () => {
    const groups = await dbRead.quiz.groupBy({
      by: ['authorId'],
      where: { status: 'PUBLISHED', visibility: 'PUBLIC', deletedAt: null },
      _sum: { playCount: true },
      _count: { _all: true },
      orderBy: { _sum: { playCount: 'desc' } },
      take: 8,
    });
    const profiles = await dbRead.profile.findMany({
      where: { userId: { in: groups.map((g) => g.authorId) } },
      select: { userId: true, username: true, displayName: true, bio: true, followersCount: true },
    });
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    return groups.flatMap((g) => {
      const p = byId.get(g.authorId);
      return p
        ? [
            {
              username: p.username,
              displayName: p.displayName,
              bio: p.bio,
              followersCount: p.followersCount,
              quizzes: g._count._all,
              plays: g._sum.playCount ?? 0,
            },
          ]
        : [];
    });
  });
}

/**
 * "Para ti": categorías que más le interesan al usuario (favoritos, buenas notas y sus quizzes)
 * → quizzes en tendencia de esas categorías que aún no ha guardado ni creado.
 */
export async function getForYou(userId: string): Promise<QuizCardData[]> {
  return cached(`library:foryou:${userId}`, 120, async () => {
    const rows = await dbRead.$queryRaw<{ category: string; weight: number }[]>`
      SELECT category, SUM(weight)::float8 AS weight FROM (
        SELECT q."category", 3 AS weight FROM "Favorite" f JOIN "Quiz" q ON q."id" = f."quizId" WHERE f."userId" = ${userId}
        UNION ALL
        SELECT q."category", r."stars" - 2 FROM "Rating" r JOIN "Quiz" q ON q."id" = r."quizId" WHERE r."userId" = ${userId}
        UNION ALL
        SELECT q."category", 2 FROM "Quiz" q WHERE q."authorId" = ${userId} AND q."deletedAt" IS NULL
        UNION ALL
        SELECT q."category", 1 FROM "Player" p JOIN "GameSession" g ON g."id" = p."gameId" JOIN "Quiz" q ON q."id" = g."quizId" WHERE p."userId" = ${userId}
      ) s
      WHERE category IS NOT NULL
      GROUP BY category
      HAVING SUM(weight) > 0
      ORDER BY 2 DESC
      LIMIT 3
    `;
    if (rows.length === 0) return [];
    const quizzes = await dbRead.quiz.findMany({
      where: {
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        deletedAt: null,
        category: { in: rows.map((r) => r.category) },
        authorId: { not: userId },
        favorites: { none: { userId } },
      },
      orderBy: [{ trendingScore: 'desc' }, { id: 'desc' }],
      take: 12,
      select: { id: true },
    });
    return cardsByIds(quizzes.map((q) => q.id));
  });
}

/**
 * Reto del día: un quiz igual para todos, elegido de forma determinista entre los mejores.
 * Se registra en DailyChallenge (fecha única) la primera vez que alguien lo pide ese día.
 */
export async function getDailyChallenge(): Promise<QuizCardData | null> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const key = `library:daily:${today.toISOString().slice(0, 10)}`;
  const quizId = await cached(key, 3600, async () => {
    const existing = await db.dailyChallenge.findUnique({ where: { date: today } });
    if (existing) return existing.quizId;
    const pool = await dbRead.quiz.findMany({
      where: {
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        deletedAt: null,
        questionCount: { gte: 3 },
      },
      orderBy: [{ ratingScore: 'desc' }, { playCount: 'desc' }],
      take: 30,
      select: { id: true },
    });
    if (pool.length === 0) return null;
    const dayNumber = Math.floor(today.getTime() / 86_400_000);
    const pick = pool[dayNumber % pool.length]!.id;
    const row = await db.dailyChallenge.upsert({
      where: { date: today },
      create: { date: today, quizId: pick },
      update: {},
    });
    return row.quizId;
  });
  if (!quizId) return null;
  const [card] = await cardsByIds([quizId]);
  return card ?? null;
}

// ───────────────────────────── Página del quiz ─────────────────────────────

export async function getPublicQuiz(id: string) {
  return cached(`quiz:public:${id}`, 30, async () => {
    const quiz = await dbRead.quiz.findFirst({
      where: { id, deletedAt: null, status: { in: ['PUBLISHED', 'HIDDEN'] } },
      select: {
        ...cardSelect,
        authorId: true,
        status: true,
        tags: true,
        remixCount: true,
        commentCount: true,
        author: {
          select: {
            profile: {
              select: {
                username: true,
                displayName: true,
                bio: true,
                followersCount: true,
                quizzesCount: true,
              },
            },
          },
        },
        remixOf: {
          select: {
            id: true,
            title: true,
            author: { select: { profile: { select: { username: true } } } },
          },
        },
        // Solo enunciados y tipos: las respuestas nunca se envían a la página pública
        questions: {
          orderBy: { position: 'asc' },
          select: { id: true, type: true, prompt: true, timeLimit: true, points: true },
        },
      },
    });
    if (!quiz) return null;
    return {
      ...quiz,
      firstQuestion: quiz.questions[0]?.prompt ?? null,
      author: {
        id: quiz.authorId,
        username: quiz.author.profile?.username ?? '',
        displayName: quiz.author.profile?.displayName ?? '—',
        bio: quiz.author.profile?.bio ?? null,
        followersCount: quiz.author.profile?.followersCount ?? 0,
        quizzesCount: quiz.author.profile?.quizzesCount ?? 0,
      },
      remixOf: quiz.remixOf
        ? {
            id: quiz.remixOf.id,
            title: quiz.remixOf.title,
            username: quiz.remixOf.author.profile?.username ?? '',
          }
        : null,
    };
  });
}

export type PublicQuiz = NonNullable<Awaited<ReturnType<typeof getPublicQuiz>>>;

/** Quizzes similares: misma categoría o etiquetas en común, ordenados por tendencia. */
export async function getSimilarQuizzes(quiz: Pick<PublicQuiz, 'id' | 'category' | 'tags'>) {
  return cached(`quiz:similar:${quiz.id}`, 300, async () => {
    const rows = await dbRead.quiz.findMany({
      where: {
        id: { not: quiz.id },
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        deletedAt: null,
        OR: [
          ...(quiz.category ? [{ category: quiz.category }] : []),
          ...(quiz.tags.length ? [{ tags: { hasSome: quiz.tags } }] : []),
        ],
      },
      orderBy: [{ trendingScore: 'desc' }, { id: 'desc' }],
      take: 8,
      select: { id: true },
    });
    return cardsByIds(rows.map((r) => r.id));
  });
}

/** Mejores puntajes registrados en partidas de este quiz (uno por jugador). */
export async function getQuizLeaderboard(quizId: string) {
  return cached(
    `quiz:leaderboard:${quizId}`,
    60,
    () =>
      dbRead.$queryRaw<
        { nickname: string; username: string | null; score: number; playedAt: Date }[]
      >`
      SELECT nickname, username, score, "playedAt" FROM (
        SELECT DISTINCT ON (coalesce(p."userId", p."nickname"))
          p."nickname", pr."username", p."score", g."endedAt" AS "playedAt"
        FROM "Player" p
        JOIN "GameSession" g ON g."id" = p."gameId"
        LEFT JOIN "Profile" pr ON pr."userId" = p."userId"
        WHERE g."quizId" = ${quizId} AND g."status" = 'FINISHED' AND p."kicked" = false
        ORDER BY coalesce(p."userId", p."nickname"), p."score" DESC
      ) best
      ORDER BY score DESC
      LIMIT 10
    `,
  );
}
