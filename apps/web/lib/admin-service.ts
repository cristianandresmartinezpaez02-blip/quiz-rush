// Panel de administración: métricas, reportes, moderación, usuarios y uso de la IA.
// Solo para `user.role === 'admin'` (se comprueba en cada ruta y página, nunca en el cliente).
import 'server-only';
import { db, Prisma } from '@quiz-rush/db';
import { ApiError } from './api';
import { markBanned } from './ban';
import { publicQuizChanged } from './public-changes';

const DAY = 86_400_000;

export async function adminStats() {
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY);
  const since1 = new Date(now - DAY);
  const [users, newUsers, published, hidden, games24, openReports, flagged, ai] = await Promise.all(
    [
      db.user.count({ where: { isAnonymous: { not: true } } }),
      db.user.count({ where: { isAnonymous: { not: true }, createdAt: { gte: since7 } } }),
      db.quiz.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
      db.quiz.count({ where: { status: 'HIDDEN', deletedAt: null } }),
      db.gameSession.count({ where: { status: 'FINISHED', endedAt: { gte: since1 } } }),
      db.report.count({ where: { status: 'OPEN' } }),
      db.quiz.count({ where: { moderationStatus: 'FLAGGED', deletedAt: null } }),
      db.aiRequest.aggregate({
        where: { createdAt: { gte: since1 } },
        _count: true,
        _sum: { inputTokens: true, outputTokens: true },
      }),
    ],
  );
  return {
    users,
    newUsers,
    published,
    hidden,
    games24,
    openReports,
    flagged,
    aiRequests24: ai._count,
    aiTokens24: (ai._sum.inputTokens ?? 0) + (ai._sum.outputTokens ?? 0),
  };
}

// ───────────────────────── Reportes ─────────────────────────

export async function listReports(status: 'OPEN' | 'RESOLVED' | 'DISMISSED' = 'OPEN') {
  const reports = await db.report.findMany({
    where: { status },
    orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
    take: 100,
    select: {
      id: true,
      targetType: true,
      targetId: true,
      reason: true,
      details: true,
      status: true,
      createdAt: true,
      reporter: { select: { profile: { select: { username: true } } } },
    },
  });
  // Agrupar por contenido: un mismo quiz con 5 reportes es una sola tarjeta
  const groups = new Map<string, typeof reports>();
  for (const r of reports) {
    const key = `${r.targetType}:${r.targetId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const ids = (t: string) =>
    [...groups.values()].filter((g) => g[0]!.targetType === t).map((g) => g[0]!.targetId);
  const [quizzes, comments, users] = await Promise.all([
    db.quiz.findMany({
      where: { id: { in: ids('QUIZ') } },
      select: {
        id: true,
        title: true,
        status: true,
        author: { select: { id: true, profile: { select: { username: true } } } },
      },
    }),
    db.comment.findMany({
      where: { id: { in: ids('COMMENT') } },
      select: {
        id: true,
        body: true,
        hidden: true,
        quizId: true,
        author: { select: { id: true, profile: { select: { username: true } } } },
      },
    }),
    db.user.findMany({
      where: { id: { in: ids('USER') } },
      select: {
        id: true,
        banned: true,
        profile: { select: { username: true, displayName: true, bio: true } },
      },
    }),
  ]);
  const quizMap = new Map(quizzes.map((q) => [q.id, q]));
  const commentMap = new Map(comments.map((c) => [c.id, c]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  return [...groups.values()].map((g) => {
    const first = g[0]!;
    const q = quizMap.get(first.targetId);
    const c = commentMap.get(first.targetId);
    const u = userMap.get(first.targetId);
    const target =
      first.targetType === 'QUIZ'
        ? q && {
            label: q.title,
            href: `/quiz/${q.id}`,
            state: q.status,
            authorId: q.author.id,
            author: q.author.profile?.username,
          }
        : first.targetType === 'COMMENT'
          ? c && {
              label: c.body,
              href: `/quiz/${c.quizId}#comentarios`,
              state: c.hidden ? 'HIDDEN' : 'VISIBLE',
              authorId: c.author.id,
              author: c.author.profile?.username,
            }
          : u && {
              label: u.profile?.displayName ?? '—',
              href: `/perfil/${u.profile?.username}`,
              state: u.banned ? 'BANNED' : 'ACTIVE',
              authorId: u.id,
              author: u.profile?.username,
            };
    return {
      targetType: first.targetType,
      targetId: first.targetId,
      target: target ?? null,
      count: g.length,
      reports: g.map((r) => ({
        id: r.id,
        reason: r.reason,
        details: r.details,
        reporter: r.reporter.profile?.username ?? '—',
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });
}

export type ReportDecision = 'dismiss' | 'hide' | 'restore' | 'ban';

/** Decide sobre TODOS los reportes abiertos de un contenido a la vez. */
export async function decideReport(
  adminId: string,
  targetType: 'QUIZ' | 'COMMENT' | 'USER',
  targetId: string,
  decision: ReportDecision,
) {
  if (decision === 'hide' || decision === 'restore') {
    const hide = decision === 'hide';
    if (targetType === 'QUIZ') await setQuizVisibility(targetId, hide ? 'hide' : 'approve');
    else if (targetType === 'COMMENT')
      await db.comment.update({ where: { id: targetId }, data: { hidden: hide } });
    else throw new ApiError(400, 'INVALID_DECISION');
  }
  if (decision === 'ban') {
    const authorId =
      targetType === 'USER'
        ? targetId
        : targetType === 'QUIZ'
          ? (await db.quiz.findUnique({ where: { id: targetId }, select: { authorId: true } }))
              ?.authorId
          : (await db.comment.findUnique({ where: { id: targetId }, select: { authorId: true } }))
              ?.authorId;
    if (!authorId) throw new ApiError(404, 'TARGET_NOT_FOUND');
    await setBan(adminId, authorId, true, 'REPORTS');
  }
  await db.report.updateMany({
    where: { targetType, targetId, status: 'OPEN' },
    data: {
      status: decision === 'dismiss' || decision === 'restore' ? 'DISMISSED' : 'RESOLVED',
      resolvedById: adminId,
      resolvedAt: new Date(),
    },
  });
}

// ───────────────────────── Moderación de quizzes ─────────────────────────

export async function listModeration() {
  const rows = await db.quiz.findMany({
    where: { deletedAt: null, OR: [{ moderationStatus: 'FLAGGED' }, { status: 'HIDDEN' }] },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      moderationStatus: true,
      hiddenReason: true,
      questionCount: true,
      updatedAt: true,
      author: { select: { profile: { select: { username: true } } } },
    },
  });
  return rows.map((q) => ({
    id: q.id,
    title: q.title,
    status: q.status,
    moderationStatus: q.moderationStatus,
    hiddenReason: q.hiddenReason,
    questionCount: q.questionCount,
    author: q.author.profile?.username ?? '—',
    updatedAt: q.updatedAt.toISOString(),
  }));
}

export async function setQuizVisibility(quizId: string, action: 'approve' | 'hide') {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { publishedAt: true, authorId: true },
  });
  if (!quiz) throw new ApiError(404, 'QUIZ_NOT_FOUND');
  if (action === 'hide') {
    await db.quiz.update({
      where: { id: quizId },
      data: { status: 'HIDDEN', moderationStatus: 'FLAGGED', hiddenReason: 'ADMIN' },
    });
    await db.notification.create({
      data: { userId: quiz.authorId, type: 'QUIZ_HIDDEN', data: { quizId } },
    });
  } else {
    // Aprobar: vuelve a la Biblioteca si ya tenía una versión publicada
    await db.quiz.update({
      where: { id: quizId },
      data: {
        moderationStatus: 'APPROVED',
        hiddenReason: null,
        status: quiz.publishedAt ? 'PUBLISHED' : 'DRAFT',
      },
    });
  }
  await publicQuizChanged(quizId);
}

// ───────────────────────── Usuarios ─────────────────────────

export async function searchUsers(q: string) {
  const term = q.trim().replace(/^@/, '');
  const where: Prisma.UserWhereInput = {
    isAnonymous: { not: true },
    ...(term.length >= 2 && {
      OR: [
        { profile: { username: { startsWith: term.toLowerCase() } } },
        { profile: { displayName: { contains: term, mode: 'insensitive' } } },
        { email: { startsWith: term.toLowerCase() } },
      ],
    }),
  };
  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      email: true,
      role: true,
      banned: true,
      banReason: true,
      createdAt: true,
      profile: {
        select: {
          username: true,
          displayName: true,
          level: true,
          quizzesCount: true,
          lastSeenAt: true,
        },
      },
    },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role ?? 'user',
    banned: !!u.banned,
    banReason: u.banReason,
    createdAt: u.createdAt.toISOString(),
    username: u.profile?.username ?? '',
    displayName: u.profile?.displayName ?? '—',
    level: u.profile?.level ?? 1,
    quizzes: u.profile?.quizzesCount ?? 0,
    lastSeenAt: u.profile?.lastSeenAt?.toISOString() ?? null,
  }));
}

/** Bloquear: cierra sus sesiones y oculta sus quizzes publicados. Desbloquear no los restaura solo. */
export async function setBan(adminId: string, userId: string, banned: boolean, reason?: string) {
  if (adminId === userId) throw new ApiError(400, 'CANNOT_TARGET_SELF');
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND');
  if (target.role === 'admin') throw new ApiError(403, 'CANNOT_BAN_ADMIN');
  await db.user.update({
    where: { id: userId },
    data: { banned, banReason: banned ? (reason ?? 'ADMIN') : null, banExpires: null },
  });
  await markBanned(userId, banned);
  if (banned) {
    await db.session.deleteMany({ where: { userId } });
    const quizzes = await db.quiz.findMany({
      where: { authorId: userId, status: 'PUBLISHED' },
      select: { id: true },
    });
    await db.quiz.updateMany({
      where: { authorId: userId, status: 'PUBLISHED' },
      data: { status: 'HIDDEN', hiddenReason: 'AUTHOR_BANNED' },
    });
    await publicQuizChanged(...quizzes.map((q) => q.id));
  }
}

export async function setRole(adminId: string, userId: string, role: 'admin' | 'user') {
  if (adminId === userId) throw new ApiError(400, 'CANNOT_TARGET_SELF');
  await db.user.update({ where: { id: userId }, data: { role } });
}

// ───────────────────────── Uso de la IA ─────────────────────────

export async function aiUsage(days = 14) {
  const since = new Date(Date.now() - days * DAY);
  const rows = await db.$queryRaw<
    { day: Date; kind: string; requests: bigint; failed: bigint; tokens: bigint | null }[]
  >`
    SELECT date_trunc('day', "createdAt") AS day, kind,
           count(*) AS requests,
           count(*) FILTER (WHERE status <> 'OK') AS failed,
           sum(coalesce("inputTokens", 0) + coalesce("outputTokens", 0)) AS tokens
    FROM "AiRequest" WHERE "createdAt" >= ${since}
    GROUP BY 1, 2 ORDER BY 1 DESC, 2`;
  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    kind: r.kind,
    requests: Number(r.requests),
    failed: Number(r.failed),
    tokens: Number(r.tokens ?? 0),
  }));
}
