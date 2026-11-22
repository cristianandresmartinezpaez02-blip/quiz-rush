// Modos individuales: reglas de cada uno y contrato del API de partidas en solitario.
// El servidor guarda las respuestas correctas y mide el tiempo; el navegador solo recibe la
// pregunta pública y el resultado de cada respuesta.
import { z } from 'zod';
import type { QuestionType } from '../questions/types';
import type { GameQuestion, PublicQuestion } from '../game/types';
import type { GameRewards, SoloMode } from './rewards';

/** Tipos de pregunta que tienen sentido sin otros jugadores. */
export const SOLO_QUESTION_TYPES: readonly QuestionType[] = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'TYPE_ANSWER',
  'ORDER',
  'MATCH',
  'SLIDER',
  'PIN',
  'FILL_BLANK',
  'AUDIO',
  'REVEAL_IMAGE',
];

/** Tipos rápidos para el Rush (se responden en 1–3 s). */
export const RUSH_QUESTION_TYPES: readonly QuestionType[] = ['MULTIPLE_CHOICE', 'TRUE_FALSE'];

export const SOLO_RULES: Record<
  SoloMode,
  { maxQuestions: number; timed: boolean; speedEnabled: boolean }
> = {
  PRACTICE: { maxQuestions: 50, timed: false, speedEnabled: false },
  RUSH: { maxQuestions: 200, timed: true, speedEnabled: false },
  CHALLENGE: { maxQuestions: 30, timed: true, speedEnabled: true },
  DAILY: { maxQuestions: 10, timed: true, speedEnabled: true },
  ADVENTURE: { maxQuestions: 5, timed: true, speedEnabled: true },
  REVIEW: { maxQuestions: 10, timed: false, speedEnabled: false },
  /** Tareas de clase: la velocidad depende de los ajustes de la tarea */
  ASSIGNMENT: { maxQuestions: 50, timed: true, speedEnabled: false },
};

/** Rush: 60 segundos en total; cada fallo resta 3 s. */
export const RUSH_SECONDS = 60;
export const RUSH_PENALTY_MS = 3000;
/** Sin límite real en práctica y repaso: 10 minutos por pregunta (solo para medir) */
export const UNTIMED_LIMIT_SECONDS = 600;

export const soloStartSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('PRACTICE'), quizId: z.string().min(1).max(64) }),
  z.object({ mode: z.literal('RUSH'), category: z.string().max(40).optional() }),
  z.object({ mode: z.literal('CHALLENGE'), challengeId: z.string().min(1).max(64) }),
  z.object({ mode: z.literal('DAILY') }),
  z.object({ mode: z.literal('ADVENTURE'), level: z.string().max(40) }),
  z.object({ mode: z.literal('REVIEW') }),
  z.object({ mode: z.literal('ASSIGNMENT'), assignmentId: z.string().min(1).max(64) }),
]);
export type SoloStart = z.infer<typeof soloStartSchema>;

/** Estado público de una partida en solitario. */
export interface SoloView {
  id: string;
  mode: SoloMode;
  title: string;
  theme: string;
  qIndex: number;
  total: number | null;
  question: PublicQuestion | null;
  /** Fin de la pregunta actual o del Rush (hora del servidor) */
  endsAt: number | null;
  /** Tiempo extra de accesibilidad (%), para dibujar bien la barra de tiempo */
  extraPct?: number;
  serverNow: number;
  score: number;
  correct: number;
  streak: number;
  finished: boolean;
  /** Clave del nivel de Aventura o id del desafío (para "volver a jugar") */
  ref: string | null;
}

export interface SoloAnswerResult {
  correct: boolean;
  correctness: number;
  points: number;
  streak: number;
  score: number;
  /** Lo que había que responder (para aprender del fallo) */
  solution: SoloSolution;
  explanation: string | null;
  /** Rush: nuevo final tras la penalización */
  endsAt: number | null;
  finished: boolean;
}

/** Solución que se muestra tras responder (depende del tipo). */
export type SoloSolution =
  | { kind: 'options'; optionIds: string[] }
  | { kind: 'text'; accepted: string[] }
  | { kind: 'order'; ids: string[] }
  | { kind: 'match'; pairs: { left: string; right: string }[] }
  | { kind: 'slider'; value: number; tolerance: number }
  | { kind: 'pin'; x: number; y: number; radius: number }
  | { kind: 'blanks'; answers: string[] };

export interface SoloSummary {
  mode: SoloMode;
  score: number;
  correct: number;
  answered: number;
  total: number;
  bestStreak: number;
  rewards: GameRewards;
  /** Progreso conseguido (subidas de nivel, logros, misiones…) */
  progress: ProgressOutcome | null;
  /** Aventura */
  stars?: number;
  /** Rush: récord personal */
  personalBest?: boolean;
  /** Puesto en el reto diario o el desafío */
  position?: number | null;
  /** Id del jugador para compartir el resultado (/resultado/<id>) */
  shareId?: string;
  /** Tareas de clase: nota y certificado */
  assignment?: {
    percent: number;
    passingScore: number;
    passed: boolean;
    certificateId: string | null;
  };
}

/** Lo que pasó con el progreso del jugador al terminar algo. */
export interface ProgressOutcome {
  xp: number;
  coins: number;
  levelBefore: number;
  levelAfter: number;
  rankBefore: string;
  rankAfter: string;
  dailyStreak: number;
  dailyBonus: { xp: number; coins: number } | null;
  achievements: string[];
  missionsCompleted: string[];
}

/** Solución de una pregunta para mostrarla tras responder en solitario. */
export function buildSolution(q: GameQuestion): SoloSolution {
  switch (q.type) {
    case 'TYPE_ANSWER':
      return { kind: 'text', accepted: (q.config.accepted ?? []).filter((x) => x.trim()) };
    case 'ORDER':
      return { kind: 'order', ids: q.options.map((o) => o.id) };
    case 'MATCH':
      return {
        kind: 'match',
        pairs: (q.config.pairs ?? []).map((p) => ({ left: p.left, right: p.right })),
      };
    case 'SLIDER':
      return {
        kind: 'slider',
        value: q.config.slider?.correct ?? 0,
        tolerance: q.config.slider?.tolerance ?? 0,
      };
    case 'PIN':
      return {
        kind: 'pin',
        x: q.config.pin?.x ?? 0,
        y: q.config.pin?.y ?? 0,
        radius: q.config.pin?.radius ?? 0,
      };
    case 'FILL_BLANK':
      return {
        kind: 'blanks',
        answers: (q.config.blanks ?? []).map((b) => b.find((x) => x.trim()) ?? ''),
      };
    default:
      return { kind: 'options', optionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id) };
  }
}
