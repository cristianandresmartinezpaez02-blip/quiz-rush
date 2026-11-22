// Ligas semanales: grupos de hasta 30 jugadores por división que compiten por la XP de la semana.
// Al cerrar la semana, los 5 primeros suben de división y los 5 últimos bajan.
import { RANKS, type RankId } from './levels';

export const LEAGUE_GROUP_SIZE = 30;
export const LEAGUE_PROMOTE = 5;
export const LEAGUE_DEMOTE = 5;

export const LEAGUE_TIERS = RANKS;
export type LeagueTier = RankId;

export type LeagueOutcome = 'PROMOTED' | 'STAYED' | 'RELEGATED';

/**
 * Resultado de cada miembro según su posición final (1 = primero).
 * Solo suben quienes sumaron XP; en la división más alta nadie sube y en la más baja nadie baja.
 */
export function leagueOutcome(
  tier: LeagueTier,
  position: number,
  members: number,
  weeklyXp: number,
): LeagueOutcome {
  const top = tier !== 'LEGEND' && position <= LEAGUE_PROMOTE && weeklyXp > 0;
  if (top) return 'PROMOTED';
  // Con grupos pequeños se evita que bajen casi todos: solo la mitad inferior puede bajar
  const demoteZone = Math.min(LEAGUE_DEMOTE, Math.floor(members / 2));
  const bottom = tier !== 'BRONZE' && position > members - demoteZone;
  return bottom ? 'RELEGATED' : 'STAYED';
}

/** División de la semana siguiente. */
export function nextTier(tier: LeagueTier, outcome: LeagueOutcome): LeagueTier {
  const i = LEAGUE_TIERS.indexOf(tier);
  if (outcome === 'PROMOTED') return LEAGUE_TIERS[Math.min(i + 1, LEAGUE_TIERS.length - 1)]!;
  if (outcome === 'RELEGATED') return LEAGUE_TIERS[Math.max(i - 1, 0)]!;
  return tier;
}

/** Monedas de premio al cerrar la semana según la posición. */
export function leagueReward(position: number): number {
  return [100, 60, 40][position - 1] ?? (position <= 10 ? 15 : 0);
}
