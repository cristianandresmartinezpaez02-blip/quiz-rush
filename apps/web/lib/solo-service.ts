// Partidas individuales (práctica, rush, reto diario, desafío, aventura y repaso).
//
// El SERVIDOR es la autoridad, igual que en las partidas en vivo: guarda las respuestas
// correctas, mide el tiempo desde que entrega cada pregunta y calcula los puntos. El estado vive
// en Redis mientras se juega; al terminar se guarda en PostgreSQL y se entrega la recompensa.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { db, type Prisma } from '@quiz-rush/db';
import { recordPlay, recordReviewAnswers } from '@quiz-rush/db/progress';
import {
  answerBasePoints,
  answerPayloadSchema,
  buildSolution,
  computeGameRewards,
  computeStreakBonus,
  dayKey,
  gradeAnswer,
  isScored,
  prepareGameQuestions,
  reviewQuality,
  RUSH_PENALTY_MS,
  RUSH_SECONDS,
  SOLO_RULES,
  starsFor,
  toPublicQuestion,
  UNTIMED_LIMIT_SECONDS,
  type GameQuestion,
  type PublicQuestion,
  type SoloAnswerResult,
  type SoloMode,
  type SoloStart,
  type SoloSummary,
  type SoloView,
} from '@quiz-rush/shared';
import { z } from 'zod';
import { ApiError } from './api';
import { recordScore, topScores } from './leaderboard';
import { redis } from './redis';
import { assignmentForPlay } from './class-service';
import {
  adventureQuestions,
  adventureStars,
  challengeInfo,
  dailyQuiz,
  PROGRESS_TZ,
  quizQuestions,
  reviewQuestions,
  rushQuestions,
} from './solo-content';

const TTL_SECONDS = 3 * 3600;
/** Margen para la latencia de red al responder justo al final */
const GRACE_MS = 1500;
const key = (id: string) => `solo:${id}`;

interface StoredAnswer {
  qid: string;
  c: number;
  p: number;
  t: number;
  a: unknown;
}

interface SoloState {
  id: string;
  userId: string;
  mode: SoloMode;
  title: string;
  theme: string;
  quizId: string | null;
  soloKey: string;
  ref: string | null;
  questions: GameQuestion[];
  /** Pregunta pública actual (se guarda para que el orden barajado no cambie al recargar) */
  current: PublicQuestion | null;
  qIndex: number;
  qStartedAt: number;
  /** Fin de la pregunta (o del Rush) en hora del servidor */
  endsAt: number | null;
  /** Tras responder, esperando a que el jugador pida la siguiente */
  awaitingNext: boolean;
  score: number;
  correct: number;
  streak: number;
  bestStreak: number;
  answers: StoredAnswer[];
  finished: boolean;
  summary: SoloSummary | null;
  /** Puntos por velocidad (las tareas lo deciden en sus ajustes) */
  speed: boolean;
  /** Tareas de clase */
  assignment: { id: string; passingScore: number; certificate: boolean } | null;
  /** Accesibilidad: tiempo extra por pregunta (% del perfil; no aplica al Rush) */
  extraPct?: number;
}

async function load(id: string, userId: string): Promise<SoloState> {
  const raw = await redis.get(key(id));
  if (!raw) throw new ApiError(404, 'SOLO_NOT_FOUND');
  const state = JSON.parse(raw) as SoloState;
  if (state.userId !== userId) throw new ApiError(404, 'SOLO_NOT_FOUND');
  return state;
}

async function save(state: SoloState) {
  await redis.set(key(state.id), JSON.stringify(state), 'EX', TTL_SECONDS);
}

/** Un solo cambio a la vez por partida (dobles clics, varias pestañas). */
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const lock = `solo:lock:${id}`;
  const ok = await redis.set(lock, '1', 'PX', 5000, 'NX');
  if (!ok) throw new ApiError(409, 'BUSY');
  try {
    return await fn();
  } finally {
    await redis.del(lock);
  }
}

const isRush = (s: Pick<SoloState, 'mode'>) => s.mode === 'RUSH';
const timed = (s: Pick<SoloState, 'mode'>) => SOLO_RULES[s.mode].timed;

/** Límite de la pregunta actual (ms). */
function limitMs(s: SoloState, q: GameQuestion) {
  if (isRush(s) || !timed(s)) return UNTIMED_LIMIT_SECONDS * 1000;
  return Math.round(q.timeLimit * 1000 * (1 + (s.extraPct ?? 0) / 100));
}

function total(s: SoloState) {
  return isRush(s) ? null : s.questions.length;
}

/** Empieza (o retoma) la pregunta `qIndex`: el reloj corre desde aquí. */
function openQuestion(s: SoloState, now: number) {
  const q = s.questions[s.qIndex]!;
  s.current = toPublicQuestion(q, s.qIndex, total(s) ?? s.questions.length);
  s.qStartedAt = now;
  s.awaitingNext = false;
  if (!isRush(s)) s.endsAt = timed(s) ? now + limitMs(s, q) : null;
}

export function view(s: SoloState): SoloView {
  return {
    id: s.id,
    mode: s.mode,
    title: s.title,
    theme: s.theme,
    qIndex: s.qIndex,
    total: total(s),
    question: s.finished || s.awaitingNext ? null : s.current,
    endsAt: s.endsAt,
    extraPct: s.extraPct ?? 0,
    serverNow: Date.now(),
    score: s.score,
    correct: s.correct,
    streak: s.streak,
    finished: s.finished,
    ref: s.ref,
  };
}

// ───────────────────────── Empezar ─────────────────────────

export async function startSolo(
  user: { id: string; name: string },
  input: SoloStart,
): Promise<{ id: string; view: SoloView }> {
  const rules = SOLO_RULES[input.mode];
  let questions: GameQuestion[];
  let title = '';
  let theme = 'space';
  let quizId: string | null = null;
  let soloKey: string;
  let ref: string | null = null;
  let speed = rules.speedEnabled;
  let assignment: SoloState['assignment'] = null;

  switch (input.mode) {
    case 'PRACTICE': {
      const r = await quizQuestions(input.quizId, user.id);
      ({ title, theme } = r.quiz);
      quizId = r.quiz.id;
      questions = r.questions;
      soloKey = `practice:${quizId}`;
      ref = quizId;
      break;
    }
    case 'DAILY': {
      const { day, quiz } = await dailyQuiz();
      soloKey = `daily:${day}`;
      // Un intento por día (si quedó a medias, se retoma)
      const resumed = await resumeExisting(user.id, soloKey);
      if (resumed) return resumed;
      const r = await quizQuestions(quiz.id, user.id);
      ({ title, theme } = r.quiz);
      quizId = r.quiz.id;
      questions = r.questions;
      ref = day;
      break;
    }
    case 'CHALLENGE': {
      const ch = await challengeInfo(input.challengeId);
      if (ch.endsAt && ch.endsAt.getTime() < Date.now()) throw new ApiError(410, 'CHALLENGE_ENDED');
      soloKey = `challenge:${ch.id}`;
      const resumed = await resumeExisting(user.id, soloKey);
      if (resumed) return resumed;
      questions = (ch.quizSnapshot as unknown as { questions: GameQuestion[] }).questions;
      title = ch.quiz!.title;
      theme = ch.quiz!.theme;
      quizId = ch.quiz!.id;
      ref = ch.id;
      break;
    }
    case 'ADVENTURE': {
      const r = await adventureQuestions(input.level, user.id);
      questions = r.questions;
      soloKey = `adventure:${input.level}`;
      ref = input.level;
      theme = ['jungle', 'volcano', 'candy', 'space'][
        ['nature', 'time', 'culture', 'future'].indexOf(r.world.id)
      ]!;
      break;
    }
    case 'RUSH': {
      questions = await rushQuestions(input.category);
      soloKey = `rush:${dayKey(new Date(), PROGRESS_TZ)}`;
      theme = 'neon';
      break;
    }
    case 'REVIEW': {
      questions = await reviewQuestions(user.id, rules.maxQuestions);
      soloKey = 'review';
      theme = 'ocean';
      break;
    }
    case 'ASSIGNMENT': {
      const a = await assignmentForPlay(user.id, input.assignmentId);
      // Si quedó un intento a medias (se recargó la página), se retoma en vez de gastar otro
      const open = await db.gameSession.findFirst({
        where: { assignmentId: a.id, hostId: user.id, status: 'IN_PROGRESS' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      const raw = open ? await redis.get(key(open.id)) : null;
      if (raw) {
        const state = JSON.parse(raw) as SoloState;
        return { id: state.id, view: view(state) };
      }
      questions = a.settings.questions;
      title = a.title;
      theme = a.quiz.theme;
      quizId = a.quiz.id;
      soloKey = `assignment:${a.id}`;
      ref = a.id;
      speed = a.settings.speedEnabled;
      assignment = {
        id: a.id,
        passingScore: a.settings.passingScore,
        certificate: a.settings.certificate,
      };
      break;
    }
  }

  questions = prepareGameQuestions(questions.slice(0, rules.maxQuestions), () =>
    randomBytes(4).toString('base64url'),
  );
  const id = randomBytes(12).toString('base64url');
  const now = Date.now();

  // Registro en la base de datos (las partidas en solitario también son GameSession)
  await db.gameSession.create({
    data: {
      id,
      quizId,
      hostId: user.id,
      mode: input.mode,
      status: 'IN_PROGRESS',
      soloKey,
      assignmentId: assignment?.id ?? null,
      settings: { solo: true } as Prisma.InputJsonValue,
      quizSnapshot: { questions } as unknown as Prisma.InputJsonValue,
      playerCount: 1,
      startedAt: new Date(now),
    },
  });

  const prefs = await db.profile.findUnique({
    where: { userId: user.id },
    select: { extraTimePercent: true },
  });
  const state: SoloState = {
    id,
    userId: user.id,
    mode: input.mode,
    title,
    theme,
    quizId,
    soloKey,
    ref,
    questions,
    current: null,
    qIndex: 0,
    qStartedAt: now,
    endsAt: isRush({ mode: input.mode }) ? now + RUSH_SECONDS * 1000 : null,
    awaitingNext: false,
    score: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    answers: [],
    finished: false,
    summary: null,
    speed,
    assignment,
    extraPct: prefs?.extraTimePercent ?? 0,
  };
  openQuestion(state, now);
  await save(state);
  return { id, view: view(state) };
}

/** Reto diario y desafíos: un intento por persona. Si hay uno a medias, se retoma. */
async function resumeExisting(userId: string, soloKey: string) {
  const prev = await db.gameSession.findFirst({
    where: { hostId: userId, soloKey },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  });
  if (!prev) return null;
  if (prev.status === 'FINISHED') throw new ApiError(409, 'ALREADY_PLAYED');
  const raw = await redis.get(key(prev.id));
  if (!raw) {
    // Caducó sin terminar: cuenta como jugado
    throw new ApiError(409, 'ALREADY_PLAYED');
  }
  const state = JSON.parse(raw) as SoloState;
  return { id: state.id, view: view(state) };
}

export async function getSolo(userId: string, id: string) {
  const s = await load(id, userId);
  return { view: view(s), summary: s.summary };
}

// ───────────────────────── Responder ─────────────────────────

export const soloAnswerSchema = z.object({
  qIndex: z.number().int().min(0).max(500),
  /** El tiempo se acabó en el dispositivo: cuenta como no respondida */
  timeout: z.boolean().optional(),
  answer: answerPayloadSchema.omit({ qIndex: true }).optional(),
});

export async function answerSolo(
  userId: string,
  id: string,
  body: z.infer<typeof soloAnswerSchema>,
): Promise<SoloAnswerResult & { next: SoloView | null; summary: SoloSummary | null }> {
  return withLock(id, async () => {
    const s = await load(id, userId);
    if (s.finished) throw new ApiError(409, 'FINISHED');
    if (s.awaitingNext || body.qIndex !== s.qIndex) throw new ApiError(409, 'WRONG_QUESTION');
    const q = s.questions[s.qIndex]!;
    const now = Date.now();
    const elapsed = Math.max(0, now - s.qStartedAt);
    const limit = limitMs(s, q);

    // Rush: si se acabó el tiempo global, termina sin contar esta respuesta
    if (isRush(s) && s.endsAt && now > s.endsAt + GRACE_MS) {
      const summary = await finish(s);
      return {
        correct: false,
        correctness: 0,
        points: 0,
        streak: s.streak,
        score: s.score,
        solution: buildSolution(q),
        explanation: q.explanation,
        endsAt: s.endsAt,
        finished: true,
        next: null,
        summary,
      };
    }

    const late = !isRush(s) && timed(s) && elapsed > limit + GRACE_MS;
    let correctness = 0;
    if (!body.timeout && !late) {
      if (!body.answer) throw new ApiError(400, 'INVALID_ANSWER');
      const grade = gradeAnswer(q, { qIndex: s.qIndex, ...body.answer });
      if (!grade.valid) throw new ApiError(400, grade.error ?? 'INVALID_ANSWER');
      correctness = grade.correctness;
    }

    const scored = isScored(q);
    const speed = s.speed ?? SOLO_RULES[s.mode].speedEnabled;
    let points = 0;
    if (scored && correctness >= 1) {
      s.streak += 1;
      s.correct += 1;
    } else if (scored) {
      s.streak = 0;
    }
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (isRush(s)) {
      // Rush: 1 punto por acierto; cada fallo resta 3 segundos
      points = correctness >= 1 ? 1 : 0;
      if (correctness < 1 && s.endsAt) s.endsAt -= RUSH_PENALTY_MS;
    } else if (correctness > 0) {
      points =
        answerBasePoints(q, correctness, Math.min(elapsed, limit), limit, speed) +
        (correctness >= 1 ? computeStreakBonus(s.streak) : 0);
    }
    s.score += points;
    s.answers.push({ qid: q.id, c: correctness, p: points, t: elapsed, a: body.answer ?? null });

    // Siguiente pregunta (en el Rush, inmediata; en el resto, cuando el jugador la pida)
    s.qIndex += 1;
    const outOfQuestions = s.qIndex >= s.questions.length;
    const rushOver = isRush(s) && !!s.endsAt && now >= s.endsAt;
    let summary: SoloSummary | null = null;
    let next: SoloView | null = null;
    if (outOfQuestions || rushOver) {
      summary = await finish(s);
    } else if (isRush(s)) {
      openQuestion(s, now);
      next = view(s);
    } else {
      s.awaitingNext = true;
      s.current = null;
    }
    await save(s);

    return {
      correct: correctness >= 1,
      correctness,
      points,
      streak: s.streak,
      score: s.score,
      solution: buildSolution(q),
      explanation: q.explanation,
      endsAt: s.endsAt,
      finished: s.finished,
      next,
      summary,
    };
  });
}

/** Pasa a la siguiente pregunta (el reloj empieza ahora). */
export async function nextSolo(userId: string, id: string): Promise<SoloView> {
  return withLock(id, async () => {
    const s = await load(id, userId);
    if (s.awaitingNext && !s.finished) {
      openQuestion(s, Date.now());
      await save(s);
    }
    return view(s);
  });
}

/** Terminar antes (o cuando se acaba el tiempo del Rush). */
export async function finishSolo(userId: string, id: string): Promise<SoloSummary> {
  return withLock(id, async () => {
    const s = await load(id, userId);
    if (s.summary) return s.summary;
    const summary = await finish(s);
    await save(s);
    return summary;
  });
}

// ───────────────────────── Terminar ─────────────────────────

async function finish(s: SoloState): Promise<SoloSummary> {
  if (s.summary) return s.summary;
  s.finished = true;
  s.current = null;
  const answered = s.answers.length;
  const scoredQuestions = isRush(s) ? answered : s.questions.filter(isScored).length;
  const qById = new Map(s.questions.map((q) => [q.id, q]));

  // Jugador y respuestas en la base de datos
  const nickname =
    (await db.profile.findUnique({ where: { userId: s.userId }, select: { displayName: true } }))
      ?.displayName ?? 'Rusher';
  const player = await db.player.create({
    data: {
      gameId: s.id,
      userId: s.userId,
      nickname,
      score: s.score,
      correctCount: s.correct,
      answeredCount: answered,
      bestStreak: s.bestStreak,
      finalRank: 1,
    },
    select: { id: true },
  });
  if (answered) {
    await db.playerAnswer.createMany({
      data: s.answers.map((a) => ({
        gameId: s.id,
        playerId: player.id,
        questionId: a.qid,
        answer: (a.a ?? {}) as Prisma.InputJsonValue,
        isCorrect: a.c >= 1,
        correctness: a.c,
        points: a.p,
        elapsedMs: a.t,
      })),
      skipDuplicates: true,
    });
  }
  await db.gameSession.update({
    where: { id: s.id },
    data: { status: 'FINISHED', endedAt: new Date() },
  });

  // Repaso: en el modo Repaso se reprograma cada pregunta; en el resto, entran las falladas
  await recordReviewAnswers(
    s.userId,
    s.answers
      .filter((a) => isScored(qById.get(a.qid)!))
      .map((a) => ({
        questionId: a.qid,
        quality: reviewQuality(a.c, a.t, limitMs(s, qById.get(a.qid)!)),
      })),
    { inReview: s.mode === 'REVIEW' },
  ).catch((err) => console.error('[repaso] no se pudo guardar:', err));

  // Aventura: mejor resultado del nivel
  let stars: number | undefined;
  let totalStars: number | undefined;
  if (s.mode === 'ADVENTURE' && s.ref) {
    stars = starsFor(s.correct, s.questions.length);
    const prev = await db.adventureProgress.findUnique({
      where: { userId_levelKey: { userId: s.userId, levelKey: s.ref } },
    });
    if (!prev || stars > prev.stars || s.score > prev.bestScore) {
      await db.adventureProgress.upsert({
        where: { userId_levelKey: { userId: s.userId, levelKey: s.ref } },
        create: { userId: s.userId, levelKey: s.ref, stars, bestScore: s.score },
        update: {
          stars: Math.max(stars, prev?.stars ?? 0),
          bestScore: Math.max(s.score, prev?.bestScore ?? 0),
        },
      });
    }
    totalStars = Object.values(await adventureStars(s.userId)).reduce((a, b) => a + b, 0);
  }

  // Récord del Rush (antes de registrar la partida)
  let personalBest: boolean | undefined;
  if (isRush(s)) {
    const profile = await db.profile.findUnique({
      where: { userId: s.userId },
      select: { stats: true },
    });
    const prevBest = Number((profile?.stats as { rushBest?: number } | null)?.rushBest ?? 0);
    personalBest = s.score > prevBest;
  }

  const perf = {
    mode: s.mode,
    correct: s.correct,
    answered,
    scoredQuestions,
    bestStreak: s.bestStreak,
  } as const;
  const rewards = computeGameRewards(perf);
  const progress = await recordPlay({
    ...perf,
    userId: s.userId,
    refId: s.id,
    ...(isRush(s) && { rushScore: s.score }),
    ...(totalStars !== undefined && { adventureStars: totalStars }),
    ...(s.mode === 'REVIEW' && { reviews: answered }),
  });

  // Puesto en el reto diario, el desafío o el Rush del día
  let position: number | null = null;
  if (s.soloKey.startsWith('daily:') || s.soloKey.startsWith('challenge:') || isRush(s)) {
    // Ranking en Redis (puesto del MEJOR intento de cada persona); sin Redis, desde Postgres
    position = await recordScore(s.soloKey, s.userId, s.score, s.correct);
    if (position === null) {
      const better = await db.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT p."userId") AS n FROM "Player" p
        JOIN "GameSession" g ON g."id" = p."gameId"
        WHERE g."soloKey" = ${s.soloKey} AND g."status" = 'FINISHED'
          AND p."score" > ${s.score} AND p."userId" <> ${s.userId}`;
      position = Number(better[0]?.n ?? 0) + 1;
    }
  }

  // Tareas: nota en porcentaje y certificado si aprueba
  let assignmentResult: SoloSummary['assignment'];
  if (s.assignment) {
    const percent = scoredQuestions ? Math.round((s.correct / scoredQuestions) * 100) : 0;
    const passed = percent >= s.assignment.passingScore;
    assignmentResult = {
      percent,
      passingScore: s.assignment.passingScore,
      passed,
      certificateId: passed && s.assignment.certificate ? s.id : null,
    };
  }

  s.summary = {
    mode: s.mode,
    score: s.score,
    correct: s.correct,
    answered,
    total: isRush(s) ? answered : s.questions.length,
    bestStreak: s.bestStreak,
    rewards: progress ? { ...rewards, xp: progress.xp, coins: progress.coins } : rewards,
    progress,
    ...(stars !== undefined && { stars }),
    ...(personalBest !== undefined && { personalBest }),
    ...(assignmentResult && { assignment: assignmentResult }),
    position,
    shareId: player.id,
  };
  return s.summary;
}

// ───────────────────────── Rankings ─────────────────────────

/** Ranking de una clave (reto diario, desafío o Rush del día): mejor intento de cada persona. */
export async function soloLeaderboard(soloKey: string, limit = 20) {
  return topScores(soloKey, limit);
}

// ───────────────────────── Desafíos por enlace ─────────────────────────

/** Crea un desafío: el quiz queda congelado y cualquiera con el enlace lo juega una vez. */
export async function createChallenge(userId: string, quizId: string, days: number) {
  const { quiz, questions } = await quizQuestions(quizId, userId);
  const challenge = await db.gameSession.create({
    data: {
      quizId: quiz.id,
      hostId: userId,
      mode: 'CHALLENGE',
      status: 'IN_PROGRESS',
      soloKey: 'challenge-def',
      settings: { days } as Prisma.InputJsonValue,
      quizSnapshot: {
        questions: questions.slice(0, SOLO_RULES.CHALLENGE.maxQuestions),
      } as unknown as Prisma.InputJsonValue,
      endsAt: new Date(Date.now() + days * 86_400_000),
    },
    select: { id: true },
  });
  return challenge.id;
}
