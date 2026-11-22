// Repaso inteligente con repetición espaciada (algoritmo SM-2 de SuperMemo).
// Cada pregunta fallada entra en el repaso; si se acierta, se vuelve a preguntar cada vez más
// tarde (1 día, 6 días, luego multiplicando por la "facilidad"); si se falla, vuelve a empezar.

export interface ReviewState {
  easiness: number;
  intervalDay: number;
  repetitions: number;
  lapses: number;
}

export const NEW_REVIEW: ReviewState = { easiness: 2.5, intervalDay: 0, repetitions: 0, lapses: 0 };

/**
 * Calidad de la respuesta (0–5) a partir del acierto y la rapidez.
 * 5 = perfecta y rápida · 4 = correcta · 3 = correcta pero lenta · 2 = parcial · 0–1 = fallo.
 */
export function reviewQuality(correctness: number, elapsedMs: number, limitMs: number): number {
  if (correctness >= 1) {
    const ratio = limitMs > 0 ? elapsedMs / limitMs : 0.5;
    return ratio < 0.33 ? 5 : ratio < 0.75 ? 4 : 3;
  }
  if (correctness >= 0.5) return 2;
  return correctness > 0 ? 1 : 0;
}

/** Nuevo estado tras responder. `now` permite calcular la próxima fecha de repaso. */
export function sm2(state: ReviewState, quality: number, now: Date = new Date()) {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { easiness, intervalDay, repetitions, lapses } = state;
  if (q < 3) {
    repetitions = 0;
    intervalDay = 1;
    lapses += 1;
  } else {
    repetitions += 1;
    intervalDay =
      repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(intervalDay * easiness);
  }
  easiness = Math.max(1.3, easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const dueAt = new Date(now.getTime() + intervalDay * 86_400_000);
  return { easiness: Math.round(easiness * 100) / 100, intervalDay, repetitions, lapses, dueAt };
}
