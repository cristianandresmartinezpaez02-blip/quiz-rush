// Power-ups de la partida en vivo. Cada jugador recibe 3 distintos al entrar y puede usar
// cada uno una sola vez, antes de responder. El servidor valida y aplica todos los efectos.
import type { QuestionType } from '../questions/types';

export const POWER_UPS = ['fifty', 'double', 'time', 'shield', 'second', 'hint'] as const;
export type PowerUp = (typeof POWER_UPS)[number];

export const POWER_UP_EMOJI: Record<PowerUp, string> = {
  fifty: '✂️',
  double: '✖️2',
  time: '⏱️',
  shield: '🛡️',
  second: '🔁',
  hint: '💡',
};

/** Segundos extra que da el power-up de tiempo. */
export const EXTRA_TIME_SECONDS = 10;

const CHOICE_TYPES: readonly QuestionType[] = ['MULTIPLE_CHOICE', 'AUDIO', 'REVEAL_IMAGE'];
const UNSCORED: readonly QuestionType[] = ['POLL', 'WORD_CLOUD', 'OPEN_VOTE'];

/** Reparte `count` power-ups distintos al azar. */
export function dealPowerUps(random: () => number = Math.random, count = 3): PowerUp[] {
  return [...POWER_UPS]
    .map((p) => ({ p, r: random() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, count)
    .map((x) => x.p);
}

/**
 * ¿Se puede usar este power-up en esta pregunta?
 * Devuelve el código de error o null si es válido.
 */
export function powerUpBlocker(
  type: PowerUp,
  q: {
    type: QuestionType;
    points: string;
    options: { isCorrect: boolean }[];
    hint: string | null;
    config: { multiSelect?: boolean };
  },
): string | null {
  if (UNSCORED.includes(q.type) || q.points === 'NONE') return 'POWERUP_NOT_APPLICABLE';
  if (type === 'fifty') {
    const wrong = q.options.filter((o) => !o.isCorrect).length;
    if (!CHOICE_TYPES.includes(q.type) || q.config.multiSelect || wrong < 2)
      return 'POWERUP_NOT_APPLICABLE';
  }
  if (type === 'hint' && !q.hint) return 'NO_HINT';
  if (type === 'second' && q.type === 'DRAW') return 'POWERUP_NOT_APPLICABLE';
  return null;
}

/** 50/50: elige la mitad de las opciones incorrectas para ocultar (deja al menos una incorrecta). */
export function fiftyFiftyHide(
  options: { id: string; isCorrect: boolean }[],
  random: () => number = Math.random,
): string[] {
  const wrong = options.filter((o) => !o.isCorrect).map((o) => o.id);
  const toHide = Math.max(1, Math.min(wrong.length - 1, Math.floor(options.length / 2)));
  return wrong
    .map((id) => ({ id, r: random() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, toHide)
    .map((x) => x.id);
}
