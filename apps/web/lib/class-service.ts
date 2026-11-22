// Modo profesor: clases, tareas, informes y certificados.
//
//  • Una clase tiene un código de 6 caracteres para unirse; quien la crea es TEACHER.
//  • Una tarea congela las preguntas del quiz al crearla (el informe no cambia si el quiz se edita).
//  • Los estudiantes la juegan como partida individual (modo ASSIGNMENT), con sus intentos.
//  • Informes: por estudiante (mejor intento) y por pregunta (aciertos y tiempo).
import 'server-only';
import { db, Prisma } from '@quiz-rush/db';
import {
  assignmentSettingsSchema,
  attemptPercent,
  certificateCode,
  generateClassCode,
  isScored,
  normalizeAvatar,
  type AssignmentSettings,
  type GameQuestion,
} from '@quiz-rush/shared';
import { ApiError } from './api';
import { quizQuestions } from './solo-content';

type StoredAssignmentSettings = AssignmentSettings & { questions: GameQuestion[] };

export function readAssignmentSettings(raw: unknown): StoredAssignmentSettings {
  const value = (raw ?? {}) as Partial<StoredAssignmentSettings>;
  return { ...assignmentSettingsSchema.parse(value), questions: value.questions ?? [] };
}

const isUnique = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// ───────────────────────── Clases ─────────────────────────

export async function createClass(ownerId: string, input: { name: string; description?: string }) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const created = await db.class.create({
        data: {
          name: input.name,
          description: input.description || null,
          ownerId,
          joinCode: generateClassCode(),
          members: { create: { userId: ownerId, role: 'TEACHER' } },
        },
        select: { id: true, joinCode: true },
      });
      return created;
    } catch (err) {
      if (!isUnique(err)) throw err;
    }
  }
  throw new ApiError(500, 'INTERNAL');
}

export async function joinClass(userId: string, code: string) {
  const cls = await db.class.findUnique({
    where: { joinCode: code },
    select: { id: true, archived: true },
  });
  if (!cls || cls.archived) throw new ApiError(404, 'CLASS_NOT_FOUND');
  await db.classMember.upsert({
    where: { classId_userId: { classId: cls.id, userId } },
    create: { classId: cls.id, userId, role: 'STUDENT' },
    update: {},
  });
  return cls.id;
}

async function membership(userId: string, classId: string) {
  const m = await db.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
    select: { role: true, class: { select: { archived: true, ownerId: true } } },
  });
  if (!m) throw new ApiError(404, 'CLASS_NOT_FOUND');
  return m;
}

async function requireTeacher(userId: string, classId: string) {
  const m = await membership(userId, classId);
  if (m.role !== 'TEACHER') throw new ApiError(403, 'NOT_TEACHER');
  return m;
}

export async function listMyClasses(userId: string) {
  const rows = await db.classMember.findMany({
    where: { userId, class: { archived: false } },
    orderBy: { joinedAt: 'desc' },
    select: {
      role: true,
      class: {
        select: {
          id: true,
          name: true,
          description: true,
          joinCode: true,
          owner: { select: { profile: { select: { displayName: true } } } },
          _count: { select: { members: true, assignments: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.class.id,
    name: r.class.name,
    description: r.class.description,
    role: r.role,
    joinCode: r.role === 'TEACHER' ? r.class.joinCode : null,
    teacher: r.class.owner.profile?.displayName ?? '—',
    students: r.class._count.members - 1,
    assignments: r.class._count.assignments,
  }));
}

/** Estado de una tarea para un estudiante: intentos y mejor resultado. */
async function myAttempts(userId: string, assignmentIds: string[]) {
  if (!assignmentIds.length) return new Map<string, { attempts: number; best: number | null }>();
  const sessions = await db.gameSession.findMany({
    where: { assignmentId: { in: assignmentIds }, hostId: userId, status: 'FINISHED' },
    select: {
      assignmentId: true,
      quizSnapshot: true,
      players: { select: { correctCount: true }, take: 1 },
    },
  });
  const out = new Map<string, { attempts: number; best: number | null }>();
  for (const s of sessions) {
    const total = ((s.quizSnapshot as { questions?: GameQuestion[] }).questions ?? []).filter(
      isScored,
    ).length;
    const pct = attemptPercent(s.players[0]?.correctCount ?? 0, total);
    const cur = out.get(s.assignmentId!) ?? { attempts: 0, best: null };
    out.set(s.assignmentId!, { attempts: cur.attempts + 1, best: Math.max(cur.best ?? 0, pct) });
  }
  return out;
}

export async function getClass(userId: string, classId: string) {
  const m = await membership(userId, classId);
  const cls = await db.class.findUniqueOrThrow({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      description: true,
      joinCode: true,
      archived: true,
      owner: { select: { profile: { select: { displayName: true } } } },
      assignments: {
        orderBy: { dueAt: 'asc' },
        select: {
          id: true,
          title: true,
          dueAt: true,
          settings: true,
          createdAt: true,
          quiz: { select: { id: true, title: true, theme: true } },
          _count: { select: { games: { where: { status: 'FINISHED' } } } },
        },
      },
      members: {
        orderBy: { joinedAt: 'asc' },
        select: {
          role: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              avatar: { select: { config: true } },
              profile: { select: { displayName: true, username: true } },
            },
          },
        },
      },
    },
  });
  const isTeacher = m.role === 'TEACHER';
  const attempts = isTeacher
    ? null
    : await myAttempts(
        userId,
        cls.assignments.map((a) => a.id),
      );
  return {
    id: cls.id,
    name: cls.name,
    description: cls.description,
    role: m.role,
    joinCode: isTeacher ? cls.joinCode : null,
    teacher: cls.owner.profile?.displayName ?? '—',
    assignments: cls.assignments.map((a) => {
      const s = readAssignmentSettings(a.settings);
      return {
        id: a.id,
        title: a.title,
        dueAt: a.dueAt.toISOString(),
        quiz: a.quiz,
        questionCount: s.questions.length,
        maxAttempts: s.maxAttempts,
        passingScore: s.passingScore,
        certificate: s.certificate,
        submissions: isTeacher ? a._count.games : undefined,
        mine: attempts ? (attempts.get(a.id) ?? { attempts: 0, best: null }) : undefined,
      };
    }),
    // Los estudiantes ven a sus compañeros, pero solo el profe puede gestionarlos
    members: cls.members.map((x) => ({
      userId: x.user.id,
      role: x.role,
      displayName: x.user.profile?.displayName ?? '—',
      username: x.user.profile?.username ?? '',
      avatar: normalizeAvatar(x.user.avatar?.config),
      joinedAt: x.joinedAt.toISOString(),
    })),
  };
}

export async function removeMember(teacherId: string, classId: string, userId: string) {
  await requireTeacher(teacherId, classId);
  if (teacherId === userId) throw new ApiError(400, 'CANNOT_REMOVE_SELF');
  await db.classMember.deleteMany({ where: { classId, userId, role: 'STUDENT' } });
}

export async function leaveClass(userId: string, classId: string) {
  const m = await membership(userId, classId);
  if (m.role === 'TEACHER') throw new ApiError(400, 'TEACHER_CANNOT_LEAVE');
  await db.classMember.delete({ where: { classId_userId: { classId, userId } } });
}

export async function updateClass(
  teacherId: string,
  classId: string,
  patch: { name?: string; description?: string | null; archived?: boolean; newCode?: boolean },
) {
  await requireTeacher(teacherId, classId);
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await db.class.update({
        where: { id: classId },
        data: {
          ...(patch.name && { name: patch.name }),
          ...(patch.description !== undefined && { description: patch.description }),
          ...(patch.archived !== undefined && { archived: patch.archived }),
          ...(patch.newCode && { joinCode: generateClassCode() }),
        },
        select: { id: true, joinCode: true, archived: true },
      });
    } catch (err) {
      if (!isUnique(err)) throw err;
    }
  }
  throw new ApiError(500, 'INTERNAL');
}

// ───────────────────────── Tareas ─────────────────────────

export async function createAssignment(
  teacherId: string,
  classId: string,
  input: { quizId: string; title: string; dueAt: Date; settings: AssignmentSettings },
) {
  const m = await requireTeacher(teacherId, classId);
  if (m.class.archived) throw new ApiError(400, 'CLASS_ARCHIVED');
  if (input.dueAt.getTime() < Date.now()) throw new ApiError(400, 'DUE_IN_PAST');
  const { questions } = await quizQuestions(input.quizId, teacherId);
  const assignment = await db.assignment.create({
    data: {
      classId,
      quizId: input.quizId,
      title: input.title,
      dueAt: input.dueAt,
      settings: { ...input.settings, questions } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  // Aviso a cada estudiante de la clase
  const students = await db.classMember.findMany({
    where: { classId, role: 'STUDENT' },
    select: { userId: true },
  });
  if (students.length) {
    await db.notification.createMany({
      data: students.map((s) => ({
        userId: s.userId,
        type: 'ASSIGNMENT',
        data: { classId, assignmentId: assignment.id, title: input.title },
      })),
    });
  }
  return assignment.id;
}

export async function deleteAssignment(teacherId: string, assignmentId: string) {
  const a = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: { classId: true },
  });
  if (!a) throw new ApiError(404, 'ASSIGNMENT_NOT_FOUND');
  await requireTeacher(teacherId, a.classId);
  // Las partidas de la tarea se conservan (assignmentId pasa a null) para el historial del alumno
  await db.assignment.delete({ where: { id: assignmentId } });
}

/** Todo lo necesario para que un estudiante juegue una tarea (o el profe la pruebe). */
export async function assignmentForPlay(userId: string, assignmentId: string) {
  const a = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      title: true,
      dueAt: true,
      settings: true,
      classId: true,
      quiz: { select: { id: true, theme: true } },
    },
  });
  if (!a) throw new ApiError(404, 'ASSIGNMENT_NOT_FOUND');
  const m = await membership(userId, a.classId);
  const settings = readAssignmentSettings(a.settings);
  if (m.role === 'STUDENT') {
    if (a.dueAt.getTime() < Date.now()) throw new ApiError(410, 'ASSIGNMENT_CLOSED');
    const done = await db.gameSession.count({
      where: { assignmentId, hostId: userId, status: 'FINISHED' },
    });
    if (done >= settings.maxAttempts) throw new ApiError(409, 'NO_ATTEMPTS_LEFT');
  }
  if (!settings.questions.length) throw new ApiError(400, 'NO_PLAYABLE_QUESTIONS');
  return { ...a, settings, isTeacher: m.role === 'TEACHER' };
}

// ───────────────────────── Informes ─────────────────────────

interface QuestionStat {
  id: string;
  prompt: string;
  type: string;
  answered: number;
  correct: number;
  accuracy: number;
  avgMs: number;
}

async function questionStats(
  where: Prisma.PlayerAnswerWhereInput,
  questions: GameQuestion[],
): Promise<QuestionStat[]> {
  const grouped = await db.playerAnswer.groupBy({
    by: ['questionId', 'isCorrect'],
    where,
    _count: { _all: true },
    _avg: { elapsedMs: true },
  });
  return questions.map((q) => {
    const rows = grouped.filter((g) => g.questionId === q.id);
    const answered = rows.reduce((a, r) => a + r._count._all, 0);
    const correct = rows.filter((r) => r.isCorrect).reduce((a, r) => a + r._count._all, 0);
    const avgMs = answered
      ? Math.round(rows.reduce((a, r) => a + (r._avg.elapsedMs ?? 0) * r._count._all, 0) / answered)
      : 0;
    return {
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      answered,
      correct,
      accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      avgMs,
    };
  });
}

export async function assignmentReport(teacherId: string, assignmentId: string) {
  const a = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      title: true,
      dueAt: true,
      settings: true,
      classId: true,
      class: { select: { name: true } },
      quiz: { select: { id: true, title: true } },
    },
  });
  if (!a) throw new ApiError(404, 'ASSIGNMENT_NOT_FOUND');
  await requireTeacher(teacherId, a.classId);
  const settings = readAssignmentSettings(a.settings);
  const scored = settings.questions.filter(isScored).length;

  const [students, sessions] = await Promise.all([
    db.classMember.findMany({
      where: { classId: a.classId, role: 'STUDENT' },
      orderBy: { joinedAt: 'asc' },
      select: {
        user: {
          select: {
            id: true,
            avatar: { select: { config: true } },
            profile: { select: { displayName: true, username: true } },
          },
        },
      },
    }),
    db.gameSession.findMany({
      where: { assignmentId, status: 'FINISHED' },
      orderBy: { endedAt: 'asc' },
      select: {
        id: true,
        hostId: true,
        endedAt: true,
        players: { select: { score: true, correctCount: true, answeredCount: true }, take: 1 },
      },
    }),
  ]);

  const rows = students.map(({ user }) => {
    const mine = sessions.filter((s) => s.hostId === user.id);
    const best = mine
      .map((s) => ({
        sessionId: s.id,
        percent: attemptPercent(s.players[0]?.correctCount ?? 0, scored),
        score: s.players[0]?.score ?? 0,
        correct: s.players[0]?.correctCount ?? 0,
        endedAt: s.endedAt?.toISOString() ?? null,
      }))
      .sort((x, y) => y.percent - x.percent || y.score - x.score)[0];
    return {
      userId: user.id,
      displayName: user.profile?.displayName ?? '—',
      username: user.profile?.username ?? '',
      avatar: normalizeAvatar(user.avatar?.config),
      attempts: mine.length,
      best: best ?? null,
      passed: !!best && best.percent >= settings.passingScore,
    };
  });

  const done = rows.filter((r) => r.best);
  const average = done.length
    ? Math.round(done.reduce((acc, r) => acc + r.best!.percent, 0) / done.length)
    : null;
  return {
    id: a.id,
    title: a.title,
    className: a.class.name,
    classId: a.classId,
    quiz: a.quiz,
    dueAt: a.dueAt.toISOString(),
    settings: { ...settings, questions: undefined },
    summary: {
      students: rows.length,
      completed: done.length,
      average,
      passed: rows.filter((r) => r.passed).length,
    },
    students: rows,
    questions: await questionStats(
      { game: { assignmentId, status: 'FINISHED' } },
      settings.questions,
    ),
  };
}

/** Partidas en vivo que organicé (para ver sus informes). */
export async function listHostedGames(hostId: string) {
  return db.gameSession.findMany({
    where: {
      hostId,
      status: 'FINISHED',
      soloKey: null,
      mode: { in: ['CLASSIC', 'TEAMS', 'SURVIVAL', 'RACE', 'BOSS', 'TOURNAMENT', 'TERRITORY'] },
    },
    orderBy: { endedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      mode: true,
      playerCount: true,
      endedAt: true,
      quiz: { select: { id: true, title: true } },
    },
  });
}

export async function gameReport(hostId: string, gameId: string) {
  const game = await db.gameSession.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      hostId: true,
      mode: true,
      status: true,
      soloKey: true,
      startedAt: true,
      endedAt: true,
      quizSnapshot: true,
      quiz: { select: { id: true, title: true } },
      players: {
        where: { kicked: false },
        orderBy: [{ finalRank: 'asc' }, { score: 'desc' }],
        select: {
          id: true,
          nickname: true,
          avatar: true,
          score: true,
          finalRank: true,
          correctCount: true,
          answeredCount: true,
          bestStreak: true,
          team: { select: { name: true, color: true } },
        },
      },
    },
  });
  if (!game || game.hostId !== hostId || game.soloKey) throw new ApiError(404, 'GAME_NOT_FOUND');
  const questions = (game.quizSnapshot as { questions?: GameQuestion[] }).questions ?? [];
  const scored = questions.filter(isScored).length;
  return {
    id: game.id,
    mode: game.mode,
    status: game.status,
    quiz: game.quiz,
    startedAt: game.startedAt?.toISOString() ?? null,
    endedAt: game.endedAt?.toISOString() ?? null,
    players: game.players.map((p, i) => ({
      ...p,
      avatar: (p.avatar as { emoji?: string } | null)?.emoji ?? '🙂',
      rank: p.finalRank ?? i + 1,
      percent: attemptPercent(p.correctCount, scored),
    })),
    questions: await questionStats({ gameId }, questions),
  };
}

// ───────────────────────── Certificados ─────────────────────────

/** Certificado de un intento aprobado (público: cualquiera con el enlace puede verificarlo). */
export async function getCertificate(sessionId: string) {
  const s = await db.gameSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      endedAt: true,
      quizSnapshot: true,
      host: { select: { profile: { select: { displayName: true } } } },
      players: { select: { correctCount: true }, take: 1 },
      assignment: {
        select: {
          title: true,
          settings: true,
          class: {
            select: {
              name: true,
              owner: { select: { profile: { select: { displayName: true } } } },
            },
          },
        },
      },
    },
  });
  if (!s || s.status !== 'FINISHED' || !s.assignment) return null;
  const settings = readAssignmentSettings(s.assignment.settings);
  const questions = (s.quizSnapshot as { questions?: GameQuestion[] }).questions ?? [];
  const percent = attemptPercent(
    s.players[0]?.correctCount ?? 0,
    questions.filter(isScored).length,
  );
  if (!settings.certificate || percent < settings.passingScore) return null;
  return {
    code: certificateCode(s.id),
    student: s.host?.profile?.displayName ?? '—',
    assignment: s.assignment.title,
    className: s.assignment.class.name,
    teacher: s.assignment.class.owner.profile?.displayName ?? '—',
    percent,
    date: (s.endedAt ?? new Date()).toISOString(),
  };
}
