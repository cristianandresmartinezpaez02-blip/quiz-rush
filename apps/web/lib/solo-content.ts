// De dónde salen las preguntas de cada modo individual.
import 'server-only';
import { db, Prisma } from '@quiz-rush/db';
import {
  ADVENTURE_QUESTIONS_PER_LEVEL,
  dayKey,
  hashString,
  isLevelUnlocked,
  levelDifficulty,
  parseLevelKey,
  RUSH_QUESTION_TYPES,
  seededRandom,
  shuffle,
  SOLO_QUESTION_TYPES,
  type GameQuestion,
  type QuestionType,
} from '@quiz-rush/shared';
import { ApiError } from './api';

export const PROGRESS_TZ = process.env.PROGRESS_TIMEZONE || 'America/Bogota';

const PUBLIC_QUIZ = { status: 'PUBLISHED', visibility: 'PUBLIC', deletedAt: null } as const;

const QUESTION_SELECT = {
  id: true,
  type: true,
  prompt: true,
  timeLimit: true,
  points: true,
  hint: true,
  explanation: true,
  media: true,
  config: true,
  options: {
    orderBy: { position: 'asc' },
    select: { id: true, text: true, isCorrect: true },
  },
} satisfies Prisma.QuestionSelect;

type QuestionRow = Prisma.QuestionGetPayload<{ select: typeof QUESTION_SELECT }>;

export function rowToGameQuestion(q: QuestionRow): GameQuestion {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    timeLimit: q.timeLimit,
    points: q.points,
    hint: q.hint,
    explanation: q.explanation,
    media: (q.media as GameQuestion['media']) ?? null,
    options: q.options,
    config: (q.config ?? {}) as GameQuestion['config'],
  };
}

const soloTypes = SOLO_QUESTION_TYPES as QuestionType[];

/** Preguntas de un quiz (en orden). El autor puede practicar sus quizzes no públicos. */
export async function quizQuestions(quizId: string, userId: string) {
  const quiz = await db.quiz.findFirst({
    where: {
      id: quizId,
      deletedAt: null,
      OR: [
        { status: 'PUBLISHED', visibility: { in: ['PUBLIC', 'UNLISTED'] } },
        { authorId: userId },
      ],
    },
    select: {
      id: true,
      title: true,
      theme: true,
      questions: {
        where: { type: { in: soloTypes } },
        orderBy: { position: 'asc' },
        select: QUESTION_SELECT,
      },
    },
  });
  if (!quiz) throw new ApiError(404, 'QUIZ_NOT_FOUND');
  if (!quiz.questions.length) throw new ApiError(400, 'NO_PLAYABLE_QUESTIONS');
  return { quiz, questions: quiz.questions.map(rowToGameQuestion) };
}

// ───────────────────────── Reto diario ─────────────────────────

/** Quiz del día: el mismo para todos; se elige una vez y se guarda en DailyChallenge. */
export async function dailyQuiz(day = dayKey(new Date(), PROGRESS_TZ)) {
  const date = new Date(`${day}T00:00:00Z`);
  const existing = await db.dailyChallenge.findUnique({
    where: { date },
    select: {
      quiz: { select: { id: true, title: true, theme: true, category: true, coverUrl: true } },
    },
  });
  if (existing) return { day, quiz: existing.quiz };

  // Candidatos: quizzes públicos con al menos 5 preguntas jugables en solitario
  const candidates = await db.$queryRaw<{ id: string }[]>`
    SELECT q."id" FROM "Quiz" q
    WHERE q."status" = 'PUBLISHED' AND q."visibility" = 'PUBLIC' AND q."deletedAt" IS NULL
      AND (SELECT count(*) FROM "Question" x WHERE x."quizId" = q."id"
           AND x."type"::text = ANY(${soloTypes}::text[])) >= 5
    ORDER BY q."id"`;
  if (!candidates.length) throw new ApiError(404, 'NO_DAILY_QUIZ');
  // No repetir el de ayer si se puede
  const pick = candidates[hashString(day) % candidates.length]!.id;
  await db.dailyChallenge.upsert({ where: { date }, create: { date, quizId: pick }, update: {} });
  const row = await db.dailyChallenge.findUniqueOrThrow({
    where: { date },
    select: {
      quiz: { select: { id: true, title: true, theme: true, category: true, coverUrl: true } },
    },
  });
  return { day, quiz: row.quiz };
}

// ───────────────────────── Aventura ─────────────────────────

/** Estrellas del jugador por nivel. */
export async function adventureStars(userId: string): Promise<Record<string, number>> {
  const rows = await db.adventureProgress.findMany({
    where: { userId },
    select: { levelKey: true, stars: true },
  });
  return Object.fromEntries(rows.map((r) => [r.levelKey, r.stars]));
}

/**
 * Preguntas de un nivel: de las categorías del mundo y la dificultad del nivel, elegidas de
 * forma estable (el mismo nivel tiene las mismas preguntas mientras la Biblioteca no cambie).
 */
export async function adventureQuestions(key: string, userId: string) {
  const parsed = parseLevelKey(key);
  if (!parsed) throw new ApiError(404, 'LEVEL_NOT_FOUND');
  if (!isLevelUnlocked(key, await adventureStars(userId))) throw new ApiError(403, 'LEVEL_LOCKED');
  const { world, level } = parsed;

  const pool = async (difficulty?: 'EASY' | 'MEDIUM' | 'HARD', anyCategory = false) =>
    db.question.findMany({
      where: {
        type: { in: soloTypes },
        quiz: {
          ...PUBLIC_QUIZ,
          ...(!anyCategory && { category: { in: world.categories } }),
          ...(difficulty && { difficulty }),
        },
      },
      orderBy: { id: 'asc' },
      take: 400,
      select: QUESTION_SELECT,
    });

  let rows = await pool(levelDifficulty(level));
  if (rows.length < ADVENTURE_QUESTIONS_PER_LEVEL) rows = await pool();
  if (rows.length < ADVENTURE_QUESTIONS_PER_LEVEL) rows = await pool(undefined, true);
  if (!rows.length) throw new ApiError(404, 'NO_PLAYABLE_QUESTIONS');
  const picked = shuffle(rows, seededRandom(`adventure:${key}`)).slice(
    0,
    ADVENTURE_QUESTIONS_PER_LEVEL,
  );
  return { world, level, questions: picked.map(rowToGameQuestion) };
}

// ───────────────────────── Rush ─────────────────────────

/** Preguntas rápidas al azar (opción múltiple y verdadero/falso) de quizzes públicos. */
export async function rushQuestions(category?: string) {
  const types = RUSH_QUESTION_TYPES as QuestionType[];
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT x."id" FROM "Question" x JOIN "Quiz" q ON q."id" = x."quizId"
    WHERE q."status" = 'PUBLISHED' AND q."visibility" = 'PUBLIC' AND q."deletedAt" IS NULL
      AND x."type"::text = ANY(${types}::text[])
      ${category ? Prisma.sql`AND q."category" = ${category}` : Prisma.empty}
    ORDER BY random() LIMIT 120`;
  if (ids.length < 5) throw new ApiError(404, 'NO_PLAYABLE_QUESTIONS');
  const rows = await db.question.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    select: QUESTION_SELECT,
  });
  const order = new Map(ids.map((r, i) => [r.id, i]));
  return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(rowToGameQuestion);
}

// ───────────────────────── Repaso ─────────────────────────

/** Preguntas pendientes de repaso (las que tocan hoy o antes). */
export async function reviewQuestions(userId: string, limit: number) {
  const items = await db.reviewItem.findMany({
    where: { userId, dueAt: { lte: new Date() } },
    orderBy: { dueAt: 'asc' },
    take: limit,
    select: { question: { select: QUESTION_SELECT } },
  });
  const questions = items
    .map((i) => i.question)
    .filter((q) => soloTypes.includes(q.type))
    .map(rowToGameQuestion);
  if (!questions.length) throw new ApiError(404, 'NOTHING_TO_REVIEW');
  return questions;
}

export async function reviewDueCount(userId: string) {
  return db.reviewItem.count({ where: { userId, dueAt: { lte: new Date() } } });
}

// ───────────────────────── Desafíos por enlace ─────────────────────────

/** Desafío: partida "padre" con el quiz congelado y fecha límite. */
export async function challengeInfo(id: string) {
  const ch = await db.gameSession.findFirst({
    where: { id, mode: 'CHALLENGE', soloKey: 'challenge-def' },
    select: {
      id: true,
      endsAt: true,
      createdAt: true,
      quizSnapshot: true,
      quiz: { select: { id: true, title: true, theme: true, coverUrl: true } },
      host: { select: { profile: { select: { username: true, displayName: true } } } },
    },
  });
  if (!ch || !ch.quiz) throw new ApiError(404, 'CHALLENGE_NOT_FOUND');
  return ch;
}
