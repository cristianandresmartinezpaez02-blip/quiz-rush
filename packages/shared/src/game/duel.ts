// Duelo 1 contra 1 en tiempo real: mismas preguntas para los dos, quien suma más gana.
// Cada jugador tiene un "congelar": el rival no puede responder durante 3 segundos.
import type { AvatarConfig } from '../progress/avatar';
import type { ProgressOutcome } from '../progress/solo';
import type { PublicQuestion } from './types';

export const DUEL_QUESTIONS = 7;
export const DUEL_QUESTION_SECONDS = 15;
export const DUEL_COUNTDOWN_MS = 3000;
export const DUEL_REVEAL_MS = 3500;
export const DUEL_FREEZE_MS = 3000;
export const DUEL_FREEZES = 1;
/** Si nadie aparece en este tiempo, se juega contra el bot */
export const DUEL_MATCH_TIMEOUT_MS = 12_000;

export type DuelPhase = 'countdown' | 'question' | 'reveal' | 'finished';

export interface DuelSide {
  nick: string;
  avatar: AvatarConfig;
  bot: boolean;
  score: number;
  correct: number;
  freezeLeft: number;
  /** Ya respondió la pregunta actual */
  answered: boolean;
  /** Congelado hasta (hora del servidor) */
  frozenUntil: number;
}

export interface DuelRound {
  qIndex: number;
  correctOptionIds: string[];
  me: { correct: boolean; points: number };
  opp: { correct: boolean; points: number };
}

/** Lo que ve cada jugador (siempre desde su punto de vista: "yo" y "rival"). */
export interface DuelView {
  id: string;
  phase: DuelPhase;
  qIndex: number;
  total: number;
  question: PublicQuestion | null;
  endsAt: number | null;
  serverNow: number;
  me: DuelSide;
  opp: DuelSide;
  round: DuelRound | null;
  result: { outcome: 'win' | 'lose' | 'draw'; progress: ProgressOutcome | null } | null;
}
