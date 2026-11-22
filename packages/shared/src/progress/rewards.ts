// Recompensas (XP y monedas) por jugar. Siempre las calcula el SERVIDOR al terminar una partida.

export const PLAY_MODES = [
  'LIVE',
  'PRACTICE',
  'RUSH',
  'DUEL',
  'CHALLENGE',
  'DAILY',
  'ADVENTURE',
  'REVIEW',
  'ASSIGNMENT',
] as const;
export type PlayMode = (typeof PLAY_MODES)[number];

/** Modos individuales (se juegan sin anfitrión). */
export const SOLO_MODES = [
  'PRACTICE',
  'RUSH',
  'CHALLENGE',
  'DAILY',
  'ADVENTURE',
  'REVIEW',
  'ASSIGNMENT',
] as const satisfies readonly PlayMode[];
export type SoloMode = (typeof SOLO_MODES)[number];

export interface GamePerformance {
  mode: PlayMode;
  /** Respuestas totalmente correctas */
  correct: number;
  /** Preguntas respondidas */
  answered: number;
  /** Preguntas que puntúan en la partida */
  scoredQuestions: number;
  bestStreak: number;
  /** Puesto final (partidas con varios jugadores) */
  rank?: number | null;
  players?: number;
  /** Duelo ganado */
  won?: boolean;
}

export interface RewardLine {
  key: 'participation' | 'correct' | 'perfect' | 'podium' | 'win' | 'streak' | 'daily';
  xp: number;
}

export interface GameRewards {
  xp: number;
  coins: number;
  lines: RewardLine[];
}

/** Tope de XP por partida (evita "granjear" con quizzes enormes). */
export const MAX_XP_PER_GAME = 250;

/** Multiplicador por modo: practicar y repasar dan menos (no hay presión de tiempo). */
const MODE_MULTIPLIER: Record<PlayMode, number> = {
  LIVE: 1,
  PRACTICE: 0.5,
  RUSH: 1,
  DUEL: 1,
  CHALLENGE: 1,
  DAILY: 1,
  ADVENTURE: 1,
  REVIEW: 0.75,
  ASSIGNMENT: 1,
};

/** ¿Partida perfecta? (todas las puntuables bien, mínimo 3) */
export function isPerfect(p: Pick<GamePerformance, 'correct' | 'scoredQuestions'>): boolean {
  return p.scoredQuestions >= 3 && p.correct >= p.scoredQuestions;
}

export function computeGameRewards(p: GamePerformance): GameRewards {
  const lines: RewardLine[] = [];
  const add = (key: RewardLine['key'], xp: number) => xp > 0 && lines.push({ key, xp });

  if (p.answered > 0) add('participation', 10);
  add('correct', p.correct * 5);
  if (isPerfect(p)) add('perfect', 25);
  if (p.rank && (p.players ?? 0) >= 3 && p.rank <= 3) add('podium', [30, 20, 10][p.rank - 1]!);
  if (p.won) add('win', 25);
  if (p.bestStreak >= 5) add('streak', 10);
  if (p.mode === 'DAILY' && p.answered > 0) add('daily', 20);

  const raw = lines.reduce((a, l) => a + l.xp, 0);
  const xp = Math.min(MAX_XP_PER_GAME, Math.round(raw * MODE_MULTIPLIER[p.mode]));
  const firstPlace = (p.rank === 1 && (p.players ?? 0) >= 2) || p.won;
  const coins = Math.floor(xp / 5) + (firstPlace ? 5 : 0);
  return { xp, coins, lines };
}

/**
 * Bono de racha diaria (primera partida del día): más días seguidos, más premio (tope 7 días).
 * Devuelve XP y monedas extra.
 */
export function dailyStreakBonus(streak: number) {
  const days = Math.min(Math.max(streak, 1), 7);
  return { xp: days * 5, coins: days * 2 };
}
