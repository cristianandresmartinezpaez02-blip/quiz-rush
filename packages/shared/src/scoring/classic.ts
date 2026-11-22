// Lógica de puntaje del modo clásico.
// IMPORTANTE: esta función solo se ejecuta en el servidor durante las partidas en vivo.
// El cliente puede usarla para mostrar estimaciones, pero nunca decide su propio puntaje.
import type { PointsMode } from '../constants';

export const BASE_POINTS: Record<PointsMode, number> = {
  NORMAL: 1000,
  DOUBLE: 2000,
  NONE: 0,
};

/** Bono por racha: +100 por acierto seguido desde el 2.º, con tope de +500. */
export const STREAK_BONUS_STEP = 100;
export const STREAK_BONUS_MAX = 500;

export interface ClassicScoreInput {
  /** Fracción de acierto entre 0 y 1 (1 = totalmente correcto; permite crédito parcial). */
  correctness: number;
  /** Milisegundos desde que el servidor abrió la pregunta hasta que recibió la respuesta. */
  elapsedMs: number;
  /** Tiempo límite de la pregunta en milisegundos. */
  timeLimitMs: number;
  pointsMode: PointsMode;
  /** Modo "sin velocidad": el puntaje depende solo de acertar. */
  speedEnabled?: boolean;
}

/**
 * Puntos base por una respuesta.
 * Con velocidad: entre el 50 % y el 100 % de la base según lo rápido que se respondió.
 *   puntos = round(base × correctness × (1 − (t / T) / 2))
 */
export function computeAnswerPoints(input: ClassicScoreInput): number {
  const { correctness, elapsedMs, timeLimitMs, pointsMode, speedEnabled = true } = input;
  const base = BASE_POINTS[pointsMode];
  if (base === 0 || timeLimitMs <= 0) return 0;

  const c = clamp(correctness, 0, 1);
  if (c === 0) return 0;
  // Respuesta fuera de tiempo: no puntúa (el servidor ya la debería haber rechazado).
  if (elapsedMs > timeLimitMs) return 0;

  const ratio = clamp(elapsedMs / timeLimitMs, 0, 1);
  const speedFactor = speedEnabled ? 1 - ratio / 2 : 1;
  return Math.round(base * c * speedFactor);
}

/** Bono por racha. `streak` es la racha DESPUÉS de contar este acierto. */
export function computeStreakBonus(streak: number): number {
  if (streak < 2) return 0;
  return Math.min((streak - 1) * STREAK_BONUS_STEP, STREAK_BONUS_MAX);
}

export interface StreakState {
  streak: number;
  /** Escudo activo: si falla, no pierde la racha (se consume). */
  shield?: boolean;
}

/** Actualiza la racha tras una respuesta. Devuelve el nuevo estado y si se gastó el escudo. */
export function nextStreak(
  state: StreakState,
  wasCorrect: boolean,
): { streak: number; shieldUsed: boolean } {
  if (wasCorrect) return { streak: state.streak + 1, shieldUsed: false };
  if (state.shield) return { streak: state.streak, shieldUsed: true };
  return { streak: 0, shieldUsed: false };
}

/**
 * Puntaje del deslizador numérico: 1 si acierta exacto, decrece linealmente
 * hasta 0 en el borde de la tolerancia.
 */
export function sliderCorrectness(answer: number, correct: number, tolerance: number): number {
  const diff = Math.abs(answer - correct);
  if (diff === 0) return 1;
  if (tolerance <= 0 || diff > tolerance) return 0;
  return 1 - diff / tolerance;
}

/** Opción múltiple con varias correctas: crédito parcial (aciertos − errores) / correctas. */
export function multiSelectCorrectness(selected: readonly string[], correct: readonly string[]) {
  if (correct.length === 0) return 0;
  const set = new Set(correct);
  const hits = selected.filter((id) => set.has(id)).length;
  const wrong = selected.length - hits;
  return clamp((hits - wrong) / correct.length, 0, 1);
}

/** Ordenar elementos: fracción de elementos en su posición correcta. */
export function orderCorrectness(answer: readonly string[], correct: readonly string[]): number {
  if (correct.length === 0) return 0;
  const hits = correct.filter((id, i) => answer[i] === id).length;
  return hits / correct.length;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
