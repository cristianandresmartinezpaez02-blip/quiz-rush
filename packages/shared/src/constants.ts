// Límites globales de la plataforma. Se usan igual en cliente y servidor.
export const LIMITS = {
  quizTitle: { min: 3, max: 120 },
  quizDescription: { max: 1000 },
  questionsPerQuiz: { max: 100 },
  questionPrompt: { max: 300 },
  optionText: { max: 120 },
  hint: { max: 200 },
  explanation: { max: 600 },
  timeLimit: { min: 5, max: 240, default: 20 },
  options: { min: 2, max: 6 },
  orderItems: { min: 2, max: 8 },
  matchPairs: { min: 2, max: 6 },
  acceptedAnswers: { max: 10 },
  username: { min: 3, max: 20 },
  displayName: { min: 2, max: 32 },
  bio: { max: 280 },
} as const;

/** Cada cuánto se autoguarda el editor (ms). */
export const AUTOSAVE_INTERVAL_MS = 2000;

/** Intervalo mínimo entre snapshots automáticos de versión (ms). */
export const VERSION_SNAPSHOT_INTERVAL_MS = 60_000;

export const POINTS_MODES = ['NORMAL', 'DOUBLE', 'NONE'] as const;
export type PointsMode = (typeof POINTS_MODES)[number];

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const LANGUAGES = ['es', 'en', 'pt', 'fr', 'de', 'it'] as const;
export type QuizLanguage = (typeof LANGUAGES)[number];
