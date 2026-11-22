// Mensajes divertidos por resultado y "momentos destacados" del final de la partida.
import type { Highlight, ResultMessageKey } from './types';

/**
 * Elige el mensaje que verá el jugador tras una pregunta:
 * "¡Imparable!", "Casi, casi…", "Remontada épica"…
 */
export function resultMessageKey(r: {
  scored: boolean;
  answered: boolean;
  correctness: number;
  streak: number;
  /** Racha que tenía antes de esta pregunta */
  previousStreak: number;
  elapsedMs: number | null;
  timeLimitMs: number;
  rank: number;
  prevRank: number | null;
}): ResultMessageKey {
  if (!r.scored) return 'poll';
  if (!r.answered) return 'noAnswer';
  if (r.correctness >= 1) {
    if (r.prevRank !== null && r.prevRank - r.rank >= 3) return 'comeback';
    if (r.streak >= 5) return 'unstoppable';
    if (r.streak >= 3) return 'onFire';
    if (r.elapsedMs !== null && r.elapsedMs < r.timeLimitMs * 0.25) return 'lightning';
    return 'nice';
  }
  if (r.correctness > 0) return 'partial';
  if (r.previousStreak >= 3) return 'streakLost';
  if (r.rank <= 3) return 'almost';
  return 'missed';
}

/** Mensaje final según el puesto. */
export function finalMessageKey(rank: number, players: number): ResultMessageKey {
  if (rank === 1) return 'unstoppable';
  if (rank <= 3) return 'onFire';
  if (rank <= Math.max(3, Math.ceil(players * 0.25))) return 'nice';
  return 'almost';
}

export interface QuestionStats {
  qIndex: number;
  prompt: string;
  scored: boolean;
  answered: number;
  correctCount: number;
  /** Respuesta correcta más rápida */
  fastest: { nick: string; avatar: string; ms: number } | null;
}

export interface PlayerStats {
  nick: string;
  avatar: string;
  bestStreak: number;
  /** Mayor subida de puestos en un solo ranking */
  bestClimb: number;
  correct: number;
}

/** Calcula los momentos destacados de la partida para la repetición final. */
export function computeHighlights(questions: QuestionStats[], players: PlayerStats[]): Highlight[] {
  const out: Highlight[] = [];
  const scored = questions.filter((q) => q.scored && q.answered > 0);

  const fastest = scored.filter((q) => q.fastest).sort((a, b) => a.fastest!.ms - b.fastest!.ms)[0];
  if (fastest?.fastest) {
    out.push({
      kind: 'fastest',
      nick: fastest.fastest.nick,
      avatar: fastest.fastest.avatar,
      value: fastest.fastest.ms,
      qIndex: fastest.qIndex,
      prompt: fastest.prompt,
    });
  }

  const streaker = [...players].sort((a, b) => b.bestStreak - a.bestStreak)[0];
  if (streaker && streaker.bestStreak >= 2) {
    out.push({
      kind: 'longestStreak',
      nick: streaker.nick,
      avatar: streaker.avatar,
      value: streaker.bestStreak,
    });
  }

  const climber = [...players].sort((a, b) => b.bestClimb - a.bestClimb)[0];
  if (climber && climber.bestClimb >= 2) {
    out.push({
      kind: 'comeback',
      nick: climber.nick,
      avatar: climber.avatar,
      value: climber.bestClimb,
    });
  }

  const rate = (q: QuestionStats) => q.correctCount / q.answered;
  if (scored.length >= 2) {
    const sorted = [...scored].sort((a, b) => rate(a) - rate(b));
    const hardest = sorted[0]!;
    const easiest = sorted[sorted.length - 1]!;
    out.push({
      kind: 'hardest',
      value: Math.round(rate(hardest) * 100),
      qIndex: hardest.qIndex,
      prompt: hardest.prompt,
    });
    if (easiest.qIndex !== hardest.qIndex) {
      out.push({
        kind: 'easiest',
        value: Math.round(rate(easiest) * 100),
        qIndex: easiest.qIndex,
        prompt: easiest.prompt,
      });
    }
  }

  const scoredCount = questions.filter((q) => q.scored).length;
  const perfect = players.filter((p) => scoredCount > 0 && p.correct === scoredCount);
  if (perfect.length > 0) {
    out.push({
      kind: 'perfect',
      nick: perfect
        .map((p) => p.nick)
        .slice(0, 3)
        .join(', '),
      value: perfect.length,
    });
  }
  return out;
}
