// Datos de prueba: 5 creadores, 6 jugadores, 10 quizzes públicos variados + 1 borrador,
// y una comunidad simulada (calificaciones, favoritos, comentarios, respuestas y seguidores).
//
// Uso: npm run db:seed   (idempotente: se puede ejecutar varias veces)
// Todas las cuentas usan la contraseña  QuizRush123!   (p. ej. demo@quizrush.dev)
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { hashPassword } from 'better-auth/crypto';
import {
  DEFAULT_AVATAR,
  levelFromXp,
  rankForLevel,
  stableStringify,
  validateQuiz,
  type QuizDoc,
} from '@quiz-rush/shared';
import {
  COMMENTS,
  CREATORS,
  FANS,
  PASSWORD,
  QUIZZES,
  REPLIES,
  type SeedQuiz,
  type SeedUser,
  ADMIN_USER,
} from './seed-data';

loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

const { db, Prisma } = await import('./index');

/** Generador pseudoaleatorio determinista: el seed produce siempre los mismos datos. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(42);
const pickN = <T>(list: T[], n: number) => [...list].sort(() => random() - 0.5).slice(0, n);
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

const passwordHash = await hashPassword(PASSWORD);

async function ensureUser(u: SeedUser): Promise<string> {
  const existing = await db.user.findUnique({ where: { email: u.email }, select: { id: true } });
  if (existing) {
    // Reparación: nivel y rango coherentes con la curva de XP (seeds anteriores los ponían a mano)
    const p = await db.profile.findUnique({ where: { userId: existing.id }, select: { xp: true } });
    if (p) {
      const level = levelFromXp(p.xp);
      await db.profile.update({
        where: { userId: existing.id },
        data: { level, rank: rankForLevel(level) },
      });
    }
    return existing.id;
  }
  const id = randomUUID();
  await db.user.create({ data: { id, email: u.email, name: u.name, emailVerified: true } });
  await db.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: passwordHash,
    },
  });
  await db.profile.create({
    data: {
      userId: id,
      username: u.username,
      displayName: u.name,
      bio: u.bio ?? null,
      country: u.country ?? null,
      xp: u.xp ?? 0,
      level: levelFromXp(u.xp ?? 0),
      rank: rankForLevel(levelFromXp(u.xp ?? 0)),
    },
  });
  const colors = ['#22d3ee', '#a3e635', '#fb923c', '#f472b6', '#a78bfa', '#2dd4bf'];
  await db.avatar.create({
    data: {
      userId: id,
      config: {
        ...DEFAULT_AVATAR,
        body: between(0, 1) ? 'blob' : 'bean',
        color: colors[between(0, 5)],
      },
    },
  });
  return id;
}

/** Convierte la definición compacta en el documento del editor (QuizDoc). */
function toDoc(q: SeedQuiz): QuizDoc {
  return {
    title: q.title,
    description: q.description,
    category: q.category,
    language: q.language,
    difficulty: q.difficulty,
    theme: q.theme,
    coverUrl: null,
    music: null,
    tags: q.tags,
    questions: q.questions.map((x) => ({
      id: randomUUID(),
      type: x.type,
      prompt: x.prompt,
      timeLimit: x.time ?? 20,
      points: ['POLL', 'WORD_CLOUD', 'OPEN_VOTE'].includes(x.type)
        ? 'NONE'
        : ('points' in x && x.points) || 'NORMAL',
      hint: x.hint ?? null,
      explanation: x.explanation ?? null,
      media: 'media' in x && x.media ? x.media : null,
      options:
        'options' in x && x.options
          ? x.options.map((o) => ({
              id: randomUUID(),
              text: o.text,
              isCorrect: !!o.correct,
              imageUrl: null,
            }))
          : [],
      config:
        x.type === 'TYPE_ANSWER'
          ? { accepted: x.accepted }
          : x.type === 'MULTIPLE_CHOICE'
            ? { multiSelect: !!x.multi }
            : 'config' in x && x.config
              ? (x.config as QuizDoc['questions'][number]['config'])
              : {},
    })),
  };
}

const slugOf = (title: string, id: string) =>
  `${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)}-${id.slice(-8)}`;

async function main() {
  // 1) Usuarios
  const userIds = new Map<string, string>();
  for (const u of [...CREATORS, ...FANS]) userIds.set(u.username, await ensureUser(u));
  const fanIds = FANS.map((f) => userIds.get(f.username)!);
  const adminId = await ensureUser(ADMIN_USER);
  await db.user.update({ where: { id: adminId }, data: { role: 'admin' } });
  console.log(
    `✓ ${userIds.size + 1} usuarios listos (contraseña: ${PASSWORD}; admin: ${ADMIN_USER.email})`,
  );

  // Catálogos de progreso (logros, misiones, tienda, temporada) y bono de bienvenida para
  // probar la tienda. grant() es idempotente: no se repite al volver a ejecutar el seed.
  const { ensureCatalogs, grant } = await import('./progress');
  await ensureCatalogs();
  for (const u of CREATORS) await grant(userIds.get(u.username)!, 'WELCOME', 'seed', 0, 600);
  console.log('✓ Catálogos de progreso y monedas de bienvenida');

  // 2) Quizzes
  const createdQuizIds: string[] = [];
  for (const def of QUIZZES) {
    const authorId = userIds.get(def.author)!;
    const exists = await db.quiz.findFirst({
      where: { authorId, title: def.title, deletedAt: null },
    });
    if (exists) {
      // Reparación idempotente: preguntas creadas sin su multimedia (seeds anteriores)
      for (const q of def.questions) {
        if (!('media' in q) || !q.media) continue;
        await db.question.updateMany({
          where: { quizId: exists.id, prompt: q.prompt, media: { equals: Prisma.DbNull } },
          data: { media: q.media },
        });
      }
      continue;
    }

    const doc = toDoc(def);
    const issues = validateQuiz(doc);
    if (!def.draft && issues.length) {
      throw new Error(
        `El quiz «${def.title}» no es válido: ${issues.map((i) => i.code).join(', ')}`,
      );
    }

    const id = randomUUID().replace(/-/g, '').slice(0, 25);
    const publishedAt = new Date(
      Date.now() - def.daysAgo * 86_400_000 - between(0, 20) * 3_600_000,
    );
    const published = !def.draft;
    await db.quiz.create({
      data: {
        id,
        slug: published ? slugOf(def.title, id) : `borrador-${id.slice(0, 12)}`,
        authorId,
        title: def.title,
        description: def.description,
        category: def.category,
        language: def.language,
        difficulty: def.difficulty,
        theme: def.theme,
        tags: def.tags,
        draft: doc,
        draftUpdatedAt: publishedAt,
        createdAt: publishedAt,
        status: published ? 'PUBLISHED' : 'DRAFT',
        moderationStatus: published ? 'APPROVED' : 'PENDING',
        publishedAt: published ? publishedAt : null,
        // Mismo hash que calcula el autoguardado: así editar no re-sincroniza sin motivo
        publishedHash: published
          ? createHash('sha1').update(stableStringify(doc)).digest('hex')
          : null,
        questionCount: doc.questions.length,
        durationSec: doc.questions.reduce((a, q) => a + q.timeLimit + 5, 0),
        questionTypes: [...new Set(doc.questions.map((q) => q.type))],
        playCount: def.plays,
        ...(published && {
          questions: {
            create: doc.questions.map((q, position) => ({
              id: q.id,
              position,
              type: q.type,
              prompt: q.prompt,
              timeLimit: q.timeLimit,
              points: q.points,
              hint: q.hint,
              explanation: q.explanation,
              config: q.config,
              ...(q.media && { media: q.media }),
              options: {
                create: q.options.map((o, i) => ({
                  id: o.id,
                  position: i,
                  text: o.text,
                  isCorrect: o.isCorrect,
                })),
              },
            })),
          },
        }),
        versions: {
          create: {
            number: 1,
            reason: published ? 'PUBLISH' : 'AUTO',
            title: def.title,
            questionCount: doc.questions.length,
            snapshot: doc,
            createdById: authorId,
            createdAt: publishedAt,
          },
        },
      },
    });
    if (published) createdQuizIds.push(id);
    console.log(`✓ «${def.title}» (${published ? 'publicado' : 'borrador'})`);
  }

  // 3) Comunidad simulada en los quizzes recién creados
  for (const quizId of createdQuizIds) {
    const quiz = await db.quiz.findUniqueOrThrow({
      where: { id: quizId },
      select: { authorId: true },
    });
    for (const fan of pickN(fanIds, between(3, 6))) {
      await db.rating.create({ data: { userId: fan, quizId, stars: between(3, 5) } });
    }
    for (const fan of pickN(fanIds, between(1, 4))) {
      await db.favorite.create({ data: { userId: fan, quizId } });
    }
    // Comentarios distintos en cada quiz (sin repetir el mismo texto)
    const bodies = pickN(COMMENTS, 3);
    for (const [i, fan] of pickN(fanIds, between(1, 3)).entries()) {
      const comment = await db.comment.create({
        data: { quizId, authorId: fan, body: bodies[i]! },
      });
      if (random() > 0.4) {
        await db.comment.create({
          data: {
            quizId,
            authorId: quiz.authorId,
            parentId: comment.id,
            body: REPLIES[between(0, REPLIES.length - 1)]!,
          },
        });
      }
      for (const liker of pickN(fanIds, between(0, 4))) {
        await db.commentLike
          .create({ data: { userId: liker, commentId: comment.id } })
          .catch(() => {});
      }
    }
  }

  // 4) Seguidores: cada jugador sigue a 2-4 creadores
  const creatorIds = CREATORS.map((c) => userIds.get(c.username)!);
  await db.follow.createMany({
    data: fanIds.flatMap((fan) =>
      pickN(creatorIds, between(2, 4)).map((creator) => ({
        followerId: fan,
        followingId: creator,
      })),
    ),
    skipDuplicates: true,
  });

  // 5) Amigos y clubes (Fase 7)
  await seedSocial(userIds);
  console.log('✓ Amistades y clubes de ejemplo');

  // 6) Recalcular todos los contadores desde los datos reales (también corrige desajustes)
  await recomputeCounters();
  console.log('✓ Contadores, calificaciones y tendencia recalculados');
  console.log('✅ Seed completado');
}

/**
 * Amistades (demo ↔ sofi y luna; solicitud pendiente de leo_gamer a demo) y dos clubes:
 * uno público de luna con varios miembros y otro privado de demo. Idempotente.
 */
async function seedSocial(userIds: Map<string, string>) {
  const id = (u: string) => userIds.get(u);
  const pairs: [string, string, 'ACCEPTED' | 'PENDING'][] = [
    ['demo', 'sofi', 'ACCEPTED'],
    ['profe_luna', 'demo', 'ACCEPTED'],
    ['leo_gamer', 'demo', 'PENDING'],
  ];
  for (const [a, b, status] of pairs) {
    const requesterId = id(a);
    const addresseeId = id(b);
    if (!requesterId || !addresseeId) continue;
    const exists = await db.friendship.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });
    if (!exists) await db.friendship.create({ data: { requesterId, addresseeId, status } });
  }

  const clubs = [
    {
      slug: 'los-cerebritos',
      name: 'Los Cerebritos',
      description: 'Club abierto para quienes no pueden parar de jugar trivia 🧠',
      emoji: '🧠',
      color: '#7c5cff',
      isPublic: true,
      inviteCode: null,
      owner: 'profe_luna',
      members: ['demo', 'sofi', 'leo_gamer', 'maxpower', 'cine_maniaco'],
    },
    {
      slug: 'equipo-demo',
      name: 'Equipo Demo',
      description: 'Club privado de pruebas: se entra con el código RUSH2345.',
      emoji: '🚀',
      color: '#ff4fa3',
      isPublic: false,
      inviteCode: 'RUSH2345',
      owner: 'demo',
      members: ['sofi'],
    },
  ];
  for (const c of clubs) {
    const ownerId = id(c.owner);
    if (!ownerId) continue;
    const existing = await db.club.findUnique({ where: { slug: c.slug }, select: { id: true } });
    if (existing) continue;
    const memberIds = c.members.map(id).filter((x): x is string => !!x);
    await db.club.create({
      data: {
        slug: c.slug,
        name: c.name,
        description: c.description,
        emoji: c.emoji,
        color: c.color,
        isPublic: c.isPublic,
        inviteCode: c.inviteCode,
        memberCount: memberIds.length + 1,
        members: {
          create: [
            { userId: ownerId, role: 'OWNER', points: between(800, 2500) },
            ...memberIds.map((userId) => ({ userId, points: between(50, 2000) })),
          ],
        },
      },
    });
  }
}

/** Recalcula los contadores desnormalizados a partir de las tablas de origen. */
async function recomputeCounters() {
  await db.$executeRaw`
    UPDATE "Quiz" q SET
      "favoriteCount" = (SELECT count(*) FROM "Favorite" f WHERE f."quizId" = q."id"),
      "commentCount"  = (SELECT count(*) FROM "Comment" c WHERE c."quizId" = q."id" AND NOT c."hidden"),
      "ratingCount"   = r.cnt,
      "ratingSum"     = r.total,
      "ratingAvg"     = CASE WHEN r.cnt > 0 THEN r.total::float / r.cnt ELSE 0 END,
      "ratingScore"   = (3.5 * 5 + r.total) / (5 + r.cnt)
    FROM (
      SELECT q2."id", count(rt.*)::int AS cnt, coalesce(sum(rt."stars"), 0)::int AS total
      FROM "Quiz" q2 LEFT JOIN "Rating" rt ON rt."quizId" = q2."id" GROUP BY q2."id"
    ) r
    WHERE r."id" = q."id"`;
  await db.$executeRaw`
    UPDATE "Comment" c SET
      "replyCount" = (SELECT count(*) FROM "Comment" r WHERE r."parentId" = c."id"),
      "likeCount"  = (SELECT count(*) FROM "CommentLike" l WHERE l."commentId" = c."id")`;
  await db.$executeRaw`
    UPDATE "Profile" p SET
      "followersCount" = (SELECT count(*) FROM "Follow" f WHERE f."followingId" = p."userId"),
      "followingCount" = (SELECT count(*) FROM "Follow" f WHERE f."followerId" = p."userId"),
      "quizzesCount"   = (SELECT count(*) FROM "Quiz" q WHERE q."authorId" = p."userId" AND q."status" = 'PUBLISHED' AND q."deletedAt" IS NULL)`;
  // Misma fórmula que trendingScore() en packages/shared
  await db.$executeRaw`
    UPDATE "Quiz" SET "trendingScore" =
      ("playCount" + 3 * "favoriteCount" + 2 * "ratingCount" * ("ratingAvg" / 5) + 1.5 * "commentCount" + 1)
      / power(extract(epoch from (now() - coalesce("publishedAt", "createdAt"))) / 3600 + 2, 1.5)
    WHERE "status" = 'PUBLISHED' AND "deletedAt" IS NULL`;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
