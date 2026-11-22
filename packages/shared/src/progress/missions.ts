// Misiones diarias y semanales. A cada jugador le tocan 3 de cada tipo, elegidas de forma
// determinista (mismo jugador + mismo día = mismas misiones, sin guardar la elección).
import { hashString } from './time';
import type { PlayMode } from './rewards';

export const MISSION_GOALS = [
  'PLAY_GAMES',
  'CORRECT_ANSWERS',
  'WIN_GAMES',
  'PLAY_MODE',
  'STREAK',
  'PERFECT_GAME',
  'EARN_XP',
  'CREATE_QUIZ',
  'REVIEW_ITEMS',
] as const;
export type MissionGoal = (typeof MISSION_GOALS)[number];

export interface MissionDef {
  code: string;
  period: 'DAILY' | 'WEEKLY';
  goalType: MissionGoal;
  goalTarget: number;
  /** PLAY_MODE: modo que cuenta */
  mode?: PlayMode;
  rewardXp: number;
  rewardCoins: number;
}

const m = (
  code: string,
  period: MissionDef['period'],
  goalType: MissionGoal,
  goalTarget: number,
  rewardXp: number,
  rewardCoins: number,
  mode?: PlayMode,
): MissionDef => ({ code, period, goalType, goalTarget, rewardXp, rewardCoins, mode });

export const MISSIONS: readonly MissionDef[] = [
  // Diarias
  m('d_play_3', 'DAILY', 'PLAY_GAMES', 3, 30, 15),
  m('d_correct_15', 'DAILY', 'CORRECT_ANSWERS', 15, 30, 15),
  m('d_streak_3', 'DAILY', 'STREAK', 3, 25, 10),
  m('d_daily', 'DAILY', 'PLAY_MODE', 1, 25, 15, 'DAILY'),
  m('d_rush', 'DAILY', 'PLAY_MODE', 1, 25, 10, 'RUSH'),
  m('d_duel', 'DAILY', 'PLAY_MODE', 1, 25, 10, 'DUEL'),
  m('d_xp_100', 'DAILY', 'EARN_XP', 100, 20, 15),
  m('d_review_5', 'DAILY', 'REVIEW_ITEMS', 5, 25, 10),
  m('d_adventure', 'DAILY', 'PLAY_MODE', 1, 25, 10, 'ADVENTURE'),
  // Semanales
  m('w_play_15', 'WEEKLY', 'PLAY_GAMES', 15, 120, 60),
  m('w_correct_100', 'WEEKLY', 'CORRECT_ANSWERS', 100, 150, 75),
  m('w_win_3', 'WEEKLY', 'WIN_GAMES', 3, 150, 75),
  m('w_perfect', 'WEEKLY', 'PERFECT_GAME', 1, 100, 50),
  m('w_create', 'WEEKLY', 'CREATE_QUIZ', 1, 120, 60),
  m('w_streak_8', 'WEEKLY', 'STREAK', 8, 120, 60),
  m('w_xp_800', 'WEEKLY', 'EARN_XP', 800, 150, 80),
  m('w_live', 'WEEKLY', 'PLAY_MODE', 3, 100, 50, 'LIVE'),
];

export const MISSIONS_PER_PERIOD = 3;

/** Las misiones que le tocan a un jugador en un periodo (siempre las mismas para esa clave). */
export function pickMissions(
  userId: string,
  period: MissionDef['period'],
  periodKey: string,
): MissionDef[] {
  return MISSIONS.filter((x) => x.period === period)
    .map((x) => ({ x, h: hashString(`${userId}:${periodKey}:${x.code}`) }))
    .sort((p, q) => p.h - q.h)
    .slice(0, MISSIONS_PER_PERIOD)
    .map((p) => p.x);
}

/** Algo que hizo el jugador y que puede hacer avanzar misiones. */
export type ProgressEvent =
  | {
      kind: 'game';
      mode: PlayMode;
      correct: number;
      bestStreak: number;
      won: boolean;
      perfect: boolean;
      xp: number;
      reviews: number;
    }
  | { kind: 'quizPublished' };

/** Cuánto avanza una misión con un evento. */
export function missionIncrement(def: MissionDef, e: ProgressEvent): number {
  if (e.kind === 'quizPublished') return def.goalType === 'CREATE_QUIZ' ? 1 : 0;
  switch (def.goalType) {
    case 'PLAY_GAMES':
      return 1;
    case 'CORRECT_ANSWERS':
      return e.correct;
    case 'WIN_GAMES':
      return e.won ? 1 : 0;
    case 'PLAY_MODE':
      return e.mode === def.mode ? 1 : 0;
    case 'PERFECT_GAME':
      return e.perfect ? 1 : 0;
    case 'EARN_XP':
      return e.xp;
    case 'REVIEW_ITEMS':
      return e.reviews;
    case 'STREAK':
      // "Consigue una racha de N": se cumple de golpe al lograrla
      return e.bestStreak >= def.goalTarget ? def.goalTarget : 0;
    case 'CREATE_QUIZ':
      return 0;
  }
}
