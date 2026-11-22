// Niveles y rangos. La curva es suave al principio (los primeros niveles llegan rápido)
// y se va alargando: subir del nivel L al L+1 cuesta 100 + 25·(L−1) XP.

export const MAX_LEVEL = 100;

export const RANKS = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'LEGEND'] as const;
export type RankId = (typeof RANKS)[number];

/** Nivel mínimo de cada rango. */
export const RANK_MIN_LEVEL: Record<RankId, number> = {
  BRONZE: 1,
  SILVER: 10,
  GOLD: 20,
  DIAMOND: 35,
  LEGEND: 50,
};

export const RANK_EMOJI: Record<RankId, string> = {
  BRONZE: '🥉',
  SILVER: '🥈',
  GOLD: '🥇',
  DIAMOND: '💎',
  LEGEND: '👑',
};

/** XP necesaria para pasar del nivel `level` al siguiente. */
export function xpForNextLevel(level: number): number {
  return 100 + 25 * (Math.max(1, level) - 1);
}

/** XP total acumulada necesaria para alcanzar `level` (nivel 1 = 0 XP). */
export function totalXpForLevel(level: number): number {
  const n = Math.min(Math.max(1, Math.floor(level)), MAX_LEVEL) - 1;
  return 100 * n + (25 * n * (n - 1)) / 2;
}

/** Nivel que corresponde a una cantidad de XP. */
export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && totalXpForLevel(level + 1) <= xp) level++;
  return level;
}

/** Progreso dentro del nivel actual (para la barra de XP). */
export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const start = totalXpForLevel(level);
  const needed = level >= MAX_LEVEL ? 0 : xpForNextLevel(level);
  const current = xp - start;
  return { level, current, needed, ratio: needed ? Math.min(1, current / needed) : 1 };
}

export function rankForLevel(level: number): RankId {
  let rank: RankId = 'BRONZE';
  for (const r of RANKS) if (level >= RANK_MIN_LEVEL[r]) rank = r;
  return rank;
}
