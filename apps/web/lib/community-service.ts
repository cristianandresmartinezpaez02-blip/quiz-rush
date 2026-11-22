// Acciones de la comunidad: favoritos, calificaciones, comentarios, colecciones, seguir,
// reportes, remix y notificaciones.
//
// Los contadores (favoritos, comentarios, seguidores…) se actualizan con incrementos atómicos
// dentro de la misma transacción que la acción: nunca se recuentan filas en cada lectura.
import 'server-only';
import { db, Prisma } from '@quiz-rush/db';
import {
  AUTO_HIDE_REPORT_THRESHOLD,
  bayesianRating,
  createEmptyQuiz,
  LIMITS,
  newId,
  type QuestionDoc,
  type QuizDoc,
} from '@quiz-rush/shared';
import { ApiError } from './api';
import { enqueue } from './jobs';
import { publicQuizChanged } from './public-changes';
import type { NotificationData } from './notification-text';
import { invalidate } from './cache';
import { cardsByIds } from './library-service';
import { createQuiz } from './quiz-service';

const isUnique = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Quiz visible para la comunidad (publicado y no borrado). */
async function getVisibleQuiz(quizId: string) {
  const quiz = await db.quiz.findFirst({
    where: { id: quizId, status: 'PUBLISHED', deletedAt: null },
    select: { id: true, authorId: true, title: true, visibility: true },
  });
  if (!quiz) throw new ApiError(404, 'QUIZ_NOT_FOUND');
  return quiz;
}

// ───────────────────────────── Estado del visitante ─────────────────────────────

/** Lo que el usuario actual ha hecho con un quiz (para pintar botones activos). */
export async function getViewerState(userId: string, quizId: string) {
  const [quiz, favorite, rating, collections, reported] = await Promise.all([
    db.quiz.findUnique({ where: { id: quizId }, select: { authorId: true } }),
    db.favorite.findUnique({ where: { userId_quizId: { userId, quizId } } }),
    db.rating.findUnique({ where: { userId_quizId: { userId, quizId } }, select: { stars: true } }),
    db.collectionItem.findMany({
      where: { quizId, collection: { ownerId: userId } },
      select: { collectionId: true },
    }),
    db.report.findFirst({ where: { reporterId: userId, targetType: 'QUIZ', targetId: quizId } }),
  ]);
  const following = quiz
    ? !!(await db.follow.findUnique({
        where: { followerId_followingId: { followerId: userId, followingId: quiz.authorId } },
      }))
    : false;
  return {
    isAuthor: quiz?.authorId === userId,
    favorited: !!favorite,
    myRating: rating?.stars ?? null,
    collectionIds: collections.map((c) => c.collectionId),
    followingAuthor: following,
    reported: !!reported,
  };
}

// ───────────────────────────── Favoritos ─────────────────────────────

export async function setFavorite(userId: string, quizId: string, on: boolean) {
  await getVisibleQuiz(quizId);
  if (on) {
    try {
      await db.$transaction([
        db.favorite.create({ data: { userId, quizId } }),
        db.quiz.update({ where: { id: quizId }, data: { favoriteCount: { increment: 1 } } }),
      ]);
    } catch (err) {
      if (!isUnique(err)) throw err; // ya estaba en favoritos: idempotente
    }
  } else {
    await db.$transaction(async (tx) => {
      const { count } = await tx.favorite.deleteMany({ where: { userId, quizId } });
      if (count)
        await tx.quiz.update({
          where: { id: quizId },
          data: { favoriteCount: { decrement: count } },
        });
    });
  }
  await invalidate(`quiz:public:${quizId}`, `library:foryou:${userId}`);
}

export async function listFavorites(userId: string, cursor?: string) {
  const rows = await db.favorite.findMany({
    where: { userId, quiz: { status: 'PUBLISHED', deletedAt: null } },
    orderBy: [{ createdAt: 'desc' }, { quizId: 'desc' }],
    take: 25,
    ...(cursor && { cursor: { userId_quizId: { userId, quizId: cursor } }, skip: 1 }),
    select: { quizId: true },
  });
  const page = rows.slice(0, 24);
  return {
    items: await cardsByIds(page.map((r) => r.quizId)),
    nextCursor: rows.length > 24 ? page[page.length - 1]!.quizId : null,
  };
}

// ───────────────────────────── Calificaciones ─────────────────────────────

export async function rateQuiz(userId: string, quizId: string, stars: number) {
  const quiz = await getVisibleQuiz(quizId);
  if (quiz.authorId === userId) throw new ApiError(403, 'CANNOT_RATE_OWN_QUIZ');

  const result = await db.$transaction(async (tx) => {
    const previous = await tx.rating.findUnique({ where: { userId_quizId: { userId, quizId } } });
    await tx.rating.upsert({
      where: { userId_quizId: { userId, quizId } },
      create: { userId, quizId, stars },
      update: { stars },
    });
    // Incremento atómico de suma y número de notas; luego se derivan la media y la bayesiana
    const updated = await tx.quiz.update({
      where: { id: quizId },
      data: {
        ratingSum: { increment: stars - (previous?.stars ?? 0) },
        ratingCount: { increment: previous ? 0 : 1 },
      },
      select: { ratingSum: true, ratingCount: true },
    });
    const ratingAvg = updated.ratingCount ? updated.ratingSum / updated.ratingCount : 0;
    await tx.quiz.update({
      where: { id: quizId },
      data: { ratingAvg, ratingScore: bayesianRating(updated.ratingSum, updated.ratingCount) },
    });
    return { ratingAvg, ratingCount: updated.ratingCount, myRating: stars };
  });
  await invalidate(`quiz:public:${quizId}`);
  return result;
}

// ───────────────────────────── Comentarios ─────────────────────────────

const commentSelect = {
  id: true,
  body: true,
  parentId: true,
  likeCount: true,
  replyCount: true,
  createdAt: true,
  authorId: true,
  author: { select: { profile: { select: { username: true, displayName: true } } } },
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

async function withLikes(rows: CommentRow[], viewerId?: string) {
  const liked = viewerId
    ? new Set(
        (
          await db.commentLike.findMany({
            where: { userId: viewerId, commentId: { in: rows.map((r) => r.id) } },
            select: { commentId: true },
          })
        ).map((l) => l.commentId),
      )
    : new Set<string>();
  return rows.map(({ author, ...c }) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    author: {
      username: author.profile?.username ?? '',
      displayName: author.profile?.displayName ?? '—',
    },
    likedByMe: liked.has(c.id),
    mine: c.authorId === viewerId,
  }));
}

export type CommentView = Awaited<ReturnType<typeof withLikes>>[number];

export async function listComments(quizId: string, viewerId?: string, cursor?: string) {
  const rows = await db.comment.findMany({
    where: { quizId, parentId: null, hidden: false },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 21,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: commentSelect,
  });
  const page = rows.slice(0, 20);
  return {
    items: await withLikes(page, viewerId),
    nextCursor: rows.length > 20 ? page[page.length - 1]!.id : null,
  };
}

export async function listReplies(commentId: string, viewerId?: string) {
  const rows = await db.comment.findMany({
    where: { parentId: commentId, hidden: false },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 100,
    select: commentSelect,
  });
  return withLikes(rows, viewerId);
}

export async function addComment(
  userId: string,
  quizId: string,
  body: string,
  parentId?: string | null,
) {
  const quiz = await getVisibleQuiz(quizId);
  let rootId: string | null = null;
  let parentAuthorId: string | null = null;
  if (parentId) {
    const parent = await db.comment.findFirst({
      where: { id: parentId, quizId, hidden: false },
      select: { id: true, parentId: true, authorId: true },
    });
    if (!parent) throw new ApiError(404, 'COMMENT_NOT_FOUND');
    // Un solo nivel de respuestas: responder a una respuesta cuelga del comentario raíz
    rootId = parent.parentId ?? parent.id;
    parentAuthorId = parent.authorId;
  }

  const comment = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { quizId, authorId: userId, body, parentId: rootId },
      select: commentSelect,
    });
    await tx.quiz.update({ where: { id: quizId }, data: { commentCount: { increment: 1 } } });
    if (rootId)
      await tx.comment.update({ where: { id: rootId }, data: { replyCount: { increment: 1 } } });
    return created;
  });

  // Avisos: al autor del quiz y a quien recibió la respuesta (sin avisarse a uno mismo)
  const actor = await actorInfo(userId);
  const notify = new Map<string, string>();
  if (quiz.authorId !== userId) notify.set(quiz.authorId, 'COMMENT');
  if (parentAuthorId && parentAuthorId !== userId) notify.set(parentAuthorId, 'REPLY');
  if (notify.size) {
    await db.notification.createMany({
      data: [...notify].map(([target, type]) => ({
        userId: target,
        type,
        data: { quizId, quizTitle: quiz.title, commentId: comment.id, ...actor },
      })),
    });
  }
  await invalidate(`quiz:public:${quizId}`);
  return (await withLikes([comment], userId))[0]!;
}

export async function deleteComment(userId: string, commentId: string) {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      authorId: true,
      quizId: true,
      parentId: true,
      replyCount: true,
      quiz: { select: { authorId: true } },
    },
  });
  if (!comment) throw new ApiError(404, 'COMMENT_NOT_FOUND');
  // Puede borrar quien lo escribió o el autor del quiz (moderación de su propio espacio)
  if (comment.authorId !== userId && comment.quiz.authorId !== userId)
    throw new ApiError(403, 'FORBIDDEN');
  await db.$transaction(async (tx) => {
    await tx.comment.delete({ where: { id: commentId } }); // las respuestas se borran en cascada
    await tx.quiz.update({
      where: { id: comment.quizId },
      data: { commentCount: { decrement: 1 + comment.replyCount } },
    });
    if (comment.parentId) {
      await tx.comment.update({
        where: { id: comment.parentId },
        data: { replyCount: { decrement: 1 } },
      });
    }
  });
  await invalidate(`quiz:public:${comment.quizId}`);
}

export async function setCommentLike(userId: string, commentId: string, on: boolean) {
  const exists = await db.comment.findUnique({ where: { id: commentId }, select: { id: true } });
  if (!exists) throw new ApiError(404, 'COMMENT_NOT_FOUND');
  if (on) {
    try {
      await db.$transaction([
        db.commentLike.create({ data: { userId, commentId } }),
        db.comment.update({ where: { id: commentId }, data: { likeCount: { increment: 1 } } }),
      ]);
    } catch (err) {
      if (!isUnique(err)) throw err;
    }
  } else {
    await db.$transaction(async (tx) => {
      const { count } = await tx.commentLike.deleteMany({ where: { userId, commentId } });
      if (count)
        await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: count } },
        });
    });
  }
  const { likeCount } = await db.comment.findUniqueOrThrow({
    where: { id: commentId },
    select: { likeCount: true },
  });
  return { likeCount, likedByMe: on };
}

// ───────────────────────────── Colecciones ─────────────────────────────

const MAX_COLLECTIONS = 50;

export async function listMyCollections(userId: string) {
  const rows = await db.collection.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
      updatedAt: true,
      _count: { select: { items: true } },
      items: {
        take: 4,
        orderBy: { addedAt: 'desc' },
        select: { quiz: { select: { coverUrl: true, theme: true } } },
      },
    },
  });
  return rows.map(({ _count, items, ...c }) => ({
    ...c,
    updatedAt: c.updatedAt.toISOString(),
    itemCount: _count.items,
    previews: items.map((i) => i.quiz),
  }));
}

export async function createCollection(
  userId: string,
  data: { name: string; description?: string | null; isPublic?: boolean },
) {
  const count = await db.collection.count({ where: { ownerId: userId } });
  if (count >= MAX_COLLECTIONS) throw new ApiError(400, 'TOO_MANY_COLLECTIONS');
  return db.collection.create({
    data: {
      ownerId: userId,
      name: data.name,
      description: data.description ?? null,
      isPublic: !!data.isPublic,
    },
    select: { id: true, name: true, isPublic: true },
  });
}

async function getOwnedCollection(userId: string, id: string) {
  const c = await db.collection.findUnique({ where: { id }, select: { ownerId: true } });
  if (!c) throw new ApiError(404, 'COLLECTION_NOT_FOUND');
  if (c.ownerId !== userId) throw new ApiError(403, 'FORBIDDEN');
}

export async function updateCollection(
  userId: string,
  id: string,
  data: { name: string; description?: string | null; isPublic?: boolean },
) {
  await getOwnedCollection(userId, id);
  return db.collection.update({
    where: { id },
    data: { name: data.name, description: data.description ?? null, isPublic: data.isPublic },
    select: { id: true, name: true, isPublic: true },
  });
}

export async function deleteCollection(userId: string, id: string) {
  await getOwnedCollection(userId, id);
  await db.collection.delete({ where: { id } });
}

export async function setCollectionItem(
  userId: string,
  collectionId: string,
  quizId: string,
  on: boolean,
) {
  await getOwnedCollection(userId, collectionId);
  if (on) {
    await getVisibleQuiz(quizId);
    await db.collectionItem.upsert({
      where: { collectionId_quizId: { collectionId, quizId } },
      create: { collectionId, quizId },
      update: {},
    });
  } else {
    await db.collectionItem.deleteMany({ where: { collectionId, quizId } });
  }
  await db.collection.update({ where: { id: collectionId }, data: { updatedAt: new Date() } });
}

/** Colección visible para el usuario (propia o pública) con sus tarjetas. */
export async function getCollection(id: string, viewerId?: string) {
  const c = await db.collection.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
      ownerId: true,
      owner: { select: { profile: { select: { username: true, displayName: true } } } },
      items: { orderBy: { addedAt: 'desc' }, take: 200, select: { quizId: true } },
    },
  });
  if (!c || (!c.isPublic && c.ownerId !== viewerId)) return null;
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    isPublic: c.isPublic,
    isMine: c.ownerId === viewerId,
    owner: {
      username: c.owner.profile?.username ?? '',
      displayName: c.owner.profile?.displayName ?? '—',
    },
    items: await cardsByIds(c.items.map((i) => i.quizId)),
  };
}

// ───────────────────────────── Seguir creadores ─────────────────────────────

export async function setFollow(followerId: string, followingId: string, on: boolean) {
  if (followerId === followingId) throw new ApiError(400, 'CANNOT_FOLLOW_SELF');
  const target = await db.profile.findUnique({
    where: { userId: followingId },
    select: { userId: true },
  });
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND');

  if (on) {
    try {
      await db.$transaction([
        db.follow.create({ data: { followerId, followingId } }),
        db.profile.update({
          where: { userId: followingId },
          data: { followersCount: { increment: 1 } },
        }),
        db.profile.update({
          where: { userId: followerId },
          data: { followingCount: { increment: 1 } },
        }),
      ]);
      await db.notification.create({
        data: { userId: followingId, type: 'FOLLOW', data: await actorInfo(followerId) },
      });
    } catch (err) {
      if (!isUnique(err)) throw err;
    }
  } else {
    await db.$transaction(async (tx) => {
      const { count } = await tx.follow.deleteMany({ where: { followerId, followingId } });
      if (count) {
        await tx.profile.update({
          where: { userId: followingId },
          data: { followersCount: { decrement: count } },
        });
        await tx.profile.update({
          where: { userId: followerId },
          data: { followingCount: { decrement: count } },
        });
      }
    });
  }
  const { followersCount } = await db.profile.findUniqueOrThrow({
    where: { userId: followingId },
    select: { followersCount: true },
  });
  return { following: on, followersCount };
}

export async function isFollowing(followerId: string, followingId: string) {
  return !!(await db.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  }));
}

// ───────────────────────────── Reportes ─────────────────────────────

export async function createReport(
  userId: string,
  input: {
    targetType: 'QUIZ' | 'COMMENT' | 'USER';
    targetId: string;
    reason: string;
    details?: string | null;
  },
) {
  const exists =
    input.targetType === 'QUIZ'
      ? await db.quiz.findUnique({ where: { id: input.targetId }, select: { authorId: true } })
      : input.targetType === 'COMMENT'
        ? await db.comment.findUnique({ where: { id: input.targetId }, select: { authorId: true } })
        : await db.user.findUnique({ where: { id: input.targetId }, select: { id: true } });
  if (!exists) throw new ApiError(404, 'TARGET_NOT_FOUND');

  try {
    await db.report.create({
      data: {
        reporterId: userId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason as never,
        details: input.details ?? null,
      },
    });
  } catch (err) {
    if (isUnique(err)) throw new ApiError(409, 'ALREADY_REPORTED');
    throw err;
  }

  // Seguridad: con muchos reportes abiertos, el contenido se oculta hasta que lo revise un admin
  const open = await db.report.count({
    where: { targetType: input.targetType, targetId: input.targetId, status: 'OPEN' },
  });
  if (open >= AUTO_HIDE_REPORT_THRESHOLD) {
    if (input.targetType === 'QUIZ') {
      await db.quiz.update({
        where: { id: input.targetId },
        data: { status: 'HIDDEN', moderationStatus: 'FLAGGED', hiddenReason: 'AUTO_REPORTS' },
      });
      await publicQuizChanged(input.targetId);
    } else if (input.targetType === 'COMMENT') {
      await db.comment.update({ where: { id: input.targetId }, data: { hidden: true } });
    }
  }
}

// ───────────────────────────── Remix ─────────────────────────────

/**
 * Duplica un quiz publicado como borrador propio, dando crédito al original.
 * Se copia la versión PUBLICADA (válida), no el borrador del autor.
 */
export async function remixQuiz(userId: string, quizId: string) {
  const source = await db.quiz.findFirst({
    where: { id: quizId, status: 'PUBLISHED', deletedAt: null },
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: { options: { orderBy: { position: 'asc' } } },
      },
    },
  });
  if (!source) throw new ApiError(404, 'QUIZ_NOT_FOUND');

  const base = createEmptyQuiz(source.language === 'en' ? 'en' : 'es');
  const suffix = ' (remix)';
  const doc: QuizDoc = {
    ...base,
    title: (source.title.slice(0, LIMITS.quizTitle.max - suffix.length) + suffix).trim(),
    description: source.description,
    category: source.category,
    language: source.language as QuizDoc['language'],
    difficulty: source.difficulty,
    theme: source.theme,
    coverUrl: source.coverUrl,
    music: source.music,
    tags: source.tags,
    questions: source.questions.map((q): QuestionDoc => ({
      id: newId(),
      type: q.type,
      prompt: q.prompt,
      timeLimit: q.timeLimit,
      points: q.points,
      hint: q.hint,
      explanation: q.explanation,
      media: (q.media as QuestionDoc['media']) ?? null,
      config: (q.config as QuestionDoc['config']) ?? {},
      options: q.options.map((o) => ({
        id: newId(),
        text: o.text,
        isCorrect: o.isCorrect,
        imageUrl: o.imageUrl,
      })),
    })),
  };

  const newQuizId = await createQuiz(userId, doc.language === 'en' ? 'en' : 'es', doc);
  await db.$transaction([
    db.quiz.update({ where: { id: newQuizId }, data: { remixOfId: source.id } }),
    db.quiz.update({ where: { id: source.id }, data: { remixCount: { increment: 1 } } }),
  ]);
  if (source.authorId !== userId) {
    await db.notification.create({
      data: {
        userId: source.authorId,
        type: 'REMIX',
        data: { quizId: source.id, quizTitle: source.title, ...(await actorInfo(userId)) },
      },
    });
  }
  return newQuizId;
}

// ───────────────────────────── Notificaciones ─────────────────────────────

async function actorInfo(userId: string) {
  const p = await db.profile.findUnique({
    where: { userId },
    select: { username: true, displayName: true },
  });
  return { actorUsername: p?.username ?? '', actorName: p?.displayName ?? '—' };
}

const FOLLOWERS_BATCH = 1000;

/**
 * Un lote del aviso "publicó un quiz": hasta 1.000 seguidores a partir del cursor.
 * Devuelve el cursor del siguiente lote (null si ya no quedan).
 */
export async function notifyFollowersPage(
  authorId: string,
  quizId: string,
  quizTitle: string,
  cursor?: string,
): Promise<{ done: number; nextCursor: string | null }> {
  const actor = await actorInfo(authorId);
  const batch = await db.follow.findMany({
    where: { followingId: authorId },
    orderBy: { followerId: 'asc' },
    take: FOLLOWERS_BATCH,
    ...(cursor && {
      cursor: { followerId_followingId: { followerId: cursor, followingId: authorId } },
      skip: 1,
    }),
    select: { followerId: true },
  });
  if (batch.length) {
    await db.notification.createMany({
      data: batch.map((f) => ({
        userId: f.followerId,
        type: 'NEW_QUIZ',
        data: { quizId, quizTitle, ...actor },
      })),
    });
  }
  return {
    done: batch.length,
    nextCursor: batch.length === FOLLOWERS_BATCH ? batch[batch.length - 1]!.followerId : null,
  };
}

/**
 * Avisa a todos los seguidores de que un creador publicó un quiz. Con worker, se encola
 * (lotes encadenados con reintentos); sin él, se recorren los lotes aquí mismo.
 */
export async function notifyFollowersOfPublish(
  authorId: string,
  quizId: string,
  quizTitle: string,
) {
  if (await enqueue('notify-followers', { authorId, quizId, quizTitle }, `publish:${quizId}`))
    return;
  let cursor: string | undefined;
  for (;;) {
    const page = await notifyFollowersPage(authorId, quizId, quizTitle, cursor);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
}

export async function listNotifications(userId: string, cursor?: string) {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 21,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    select: { id: true, type: true, data: true, readAt: true, createdAt: true },
  });
  const page = rows.slice(0, 20);
  const unread = await db.notification.count({ where: { userId, readAt: null } });
  return {
    items: page.map((n) => ({
      ...n,
      data: (n.data ?? {}) as NotificationData,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    nextCursor: rows.length > 20 ? page[page.length - 1]!.id : null,
    unread,
  };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids?.length && { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}
