// Buscador externo opcional (Meilisearch) para la Biblioteca.
//
//  • Sin MEILI_URL todo sigue en PostgreSQL (full-text + trigramas): es lo predeterminado y
//    aguanta bien decenas de miles de quizzes.
//  • Con MEILI_URL, las búsquedas CON TEXTO van a Meilisearch (más rápido, mejor tolerancia a
//    errores, menos carga en la base de datos). Los filtros y orden sin texto siguen en Postgres.
//  • Cortocircuito: si Meilisearch falla, se deja de usar 30 s y se vuelve a Postgres; la
//    búsqueda nunca se rompe.
//  • El índice se mantiene al día al publicar, editar, borrar u ocultar un quiz (por el worker,
//    o en línea si no hay worker) y con `npm run search:reindex`.
import 'server-only';
import { db } from '@quiz-rush/db';
import { enqueue } from './jobs';

const URL_ = (process.env.MEILI_URL ?? '').replace(/\/$/, '');
const KEY = process.env.MEILI_MASTER_KEY ?? '';
const INDEX = process.env.MEILI_INDEX ?? 'quizzes';
const TIMEOUT_MS = 3000;

let downUntil = 0;
let settingsApplied = false;

export function searchEngineEnabled() {
  return !!URL_;
}

async function meili<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(KEY && { authorization: `Bearer ${KEY}` }),
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`meilisearch ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Ajustes del índice (idempotente): qué campos se buscan, filtran y ordenan. */
export async function ensureSearchIndex() {
  if (settingsApplied) return;
  await meili(`/indexes`, {
    method: 'POST',
    body: JSON.stringify({ uid: INDEX, primaryKey: 'id' }),
  }).catch(
    () => {}, // ya existe
  );
  await meili(`/indexes/${INDEX}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      searchableAttributes: ['title', 'tags', 'description', 'author'],
      filterableAttributes: ['category', 'language', 'difficulty', 'questionTypes', 'durationSec'],
      sortableAttributes: ['trendingScore', 'playCount', 'ratingScore', 'publishedAt'],
      // Relevancia del texto primero; a igualdad, lo que está en tendencia
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
        'trendingScore:desc',
      ],
      typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
    }),
  });
  settingsApplied = true;
}

const docSelect = {
  id: true,
  title: true,
  description: true,
  tags: true,
  category: true,
  language: true,
  difficulty: true,
  questionTypes: true,
  durationSec: true,
  trendingScore: true,
  playCount: true,
  ratingScore: true,
  publishedAt: true,
  status: true,
  visibility: true,
  deletedAt: true,
  author: { select: { profile: { select: { displayName: true, username: true } } } },
} as const;

type DocRow = NonNullable<Awaited<ReturnType<typeof loadRow>>>;
function loadRow(quizId: string) {
  return db.quiz.findUnique({ where: { id: quizId }, select: docSelect });
}

function toDocument(q: DocRow) {
  return {
    id: q.id,
    title: q.title,
    description: q.description ?? '',
    tags: q.tags,
    author: `${q.author.profile?.displayName ?? ''} ${q.author.profile?.username ?? ''}`.trim(),
    category: q.category,
    language: q.language,
    difficulty: q.difficulty,
    questionTypes: q.questionTypes,
    durationSec: q.durationSec,
    trendingScore: q.trendingScore,
    playCount: q.playCount,
    ratingScore: q.ratingScore,
    publishedAt: q.publishedAt ? q.publishedAt.getTime() : 0,
  };
}

const searchable = (q: DocRow) =>
  q.status === 'PUBLISHED' && q.visibility === 'PUBLIC' && !q.deletedAt;

/** Sube o quita un quiz del índice según su estado actual. */
export async function syncQuizToSearch(quizId: string): Promise<boolean> {
  if (!searchEngineEnabled()) return false;
  await ensureSearchIndex();
  const row = await loadRow(quizId);
  if (row && searchable(row)) {
    await meili(`/indexes/${INDEX}/documents`, {
      method: 'POST',
      body: JSON.stringify([toDocument(row)]),
    });
  } else {
    await meili(`/indexes/${INDEX}/documents/${encodeURIComponent(quizId)}`, { method: 'DELETE' });
  }
  return true;
}

/** Tras un cambio: por el worker (con reintentos) o en línea si no hay worker. Nunca lanza. */
export async function scheduleSearchSync(quizId: string) {
  if (!searchEngineEnabled()) return;
  try {
    if (await enqueue('search-index', { quizId }, `search:${quizId}:${Date.now() >> 12}`)) return;
    await syncQuizToSearch(quizId);
  } catch (err) {
    console.error('[búsqueda] no se pudo sincronizar', quizId, (err as Error).message);
  }
}

/** Reindexado completo (script y arranque en frío), en lotes de 500. */
export async function reindexAllQuizzes(): Promise<number> {
  if (!searchEngineEnabled()) return 0;
  await ensureSearchIndex();
  let cursor: string | undefined;
  let total = 0;
  for (;;) {
    const rows = await db.quiz.findMany({
      where: { status: 'PUBLISHED', visibility: 'PUBLIC', deletedAt: null },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: docSelect,
    });
    if (!rows.length) break;
    await meili(`/indexes/${INDEX}/documents`, {
      method: 'POST',
      body: JSON.stringify(rows.map(toDocument)),
    });
    total += rows.length;
    cursor = rows[rows.length - 1]!.id;
  }
  return total;
}

export interface EngineQuery {
  text: string;
  category?: string;
  language?: string;
  difficulty?: string;
  type?: string;
  durationMin?: number;
  durationMax?: number;
  offset: number;
  limit: number;
}

const quote = (v: string) => `"${v.replace(/["\\]/g, '')}"`;

/**
 * Busca ids en Meilisearch. Devuelve null si no está activo o falló (el llamador usa Postgres).
 */
export async function searchIds(
  q: EngineQuery,
): Promise<{ ids: string[]; hasMore: boolean } | null> {
  if (!searchEngineEnabled() || Date.now() < downUntil) return null;
  const filter = [
    q.category && `category = ${quote(q.category)}`,
    q.language && `language = ${quote(q.language)}`,
    q.difficulty && `difficulty = ${quote(q.difficulty)}`,
    q.type && `questionTypes = ${quote(q.type)}`,
    q.durationMin !== undefined && `durationSec >= ${Number(q.durationMin)}`,
    q.durationMax !== undefined && `durationSec < ${Number(q.durationMax)}`,
  ].filter(Boolean);
  try {
    const res = await meili<{ hits: { id: string }[]; estimatedTotalHits?: number }>(
      `/indexes/${INDEX}/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          q: q.text,
          offset: q.offset,
          limit: q.limit + 1,
          attributesToRetrieve: ['id'],
          ...(filter.length && { filter }),
        }),
      },
    );
    return { ids: res.hits.slice(0, q.limit).map((h) => h.id), hasMore: res.hits.length > q.limit };
  } catch (err) {
    downUntil = Date.now() + 30_000;
    console.error(
      '[búsqueda] Meilisearch no responde; uso PostgreSQL 30 s:',
      (err as Error).message,
    );
    return null;
  }
}

/** Actualiza en el índice las cifras que cambian a menudo (tras recalcular la tendencia). */
export async function refreshSearchScores(): Promise<void> {
  if (!searchEngineEnabled()) return;
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.quiz.findMany({
      where: { status: 'PUBLISHED', visibility: 'PUBLIC', deletedAt: null },
      orderBy: { id: 'asc' },
      take: 1000,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: { id: true, trendingScore: true, playCount: true, ratingScore: true },
    });
    if (!rows.length) break;
    // PUT = actualización parcial (solo estos campos)
    await meili(`/indexes/${INDEX}/documents`, { method: 'PUT', body: JSON.stringify(rows) });
    cursor = rows[rows.length - 1]!.id;
  }
}
