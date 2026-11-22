// Pase de temporada: la XP ganada durante la temporada suma puntos y desbloquea niveles con
// recompensas (monedas y artículos exclusivos). Es gratuito para todos.

export const SEASON_TIERS = 30;
/** Puntos (XP) por nivel del pase */
export const SEASON_TIER_POINTS = 300;

export type SeasonReward = { tier: number } & (
  { kind: 'coins'; amount: number } | { kind: 'item'; code: string }
);

/** Recompensas de la temporada 1: monedas en casi todos los niveles y artículos en algunos hitos. */
export function seasonRewards(): SeasonReward[] {
  const items: Record<number, string> = {
    5: 'celebration:hearts',
    10: 'outfit:medal',
    15: 'hat:party',
    20: 'frame:season1',
    25: 'eyes:stars',
    30: 'hat:laurel',
  };
  return Array.from({ length: SEASON_TIERS }, (_, i) => {
    const tier = i + 1;
    const code = items[tier];
    return code
      ? { tier, kind: 'item' as const, code }
      : { tier, kind: 'coins' as const, amount: 20 + Math.floor(tier / 5) * 10 };
  });
}

export function seasonTier(points: number): number {
  return Math.min(SEASON_TIERS, Math.floor(points / SEASON_TIER_POINTS));
}
