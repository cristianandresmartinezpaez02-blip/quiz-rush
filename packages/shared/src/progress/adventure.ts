// Modo Aventura: un mapa de mundos temáticos con niveles. Cada nivel son 5 preguntas de las
// categorías del mundo (elegidas de la Biblioteca de forma estable). 1–3 estrellas según aciertos;
// cada nivel desbloquea el siguiente y el último de un mundo abre el mundo siguiente.
import type { CategoryId } from '../catalog/categories';

export interface AdventureWorld {
  id: string;
  emoji: string;
  color: string;
  categories: CategoryId[];
  levels: number;
}

export const ADVENTURE_WORLDS: readonly AdventureWorld[] = [
  {
    id: 'nature',
    emoji: '🌿',
    color: '#22c55e',
    categories: ['nature', 'science', 'general'],
    levels: 6,
  },
  {
    id: 'time',
    emoji: '🏛️',
    color: '#f59e0b',
    categories: ['history', 'geography', 'general'],
    levels: 6,
  },
  {
    id: 'culture',
    emoji: '🎭',
    color: '#ec4899',
    categories: ['art', 'music', 'movies', 'literature', 'languages', 'general'],
    levels: 6,
  },
  {
    id: 'future',
    emoji: '🚀',
    color: '#6366f1',
    categories: ['technology', 'gaming', 'math', 'science', 'general'],
    levels: 6,
  },
];

export const ADVENTURE_QUESTIONS_PER_LEVEL = 5;
export const ADVENTURE_MAX_STARS = ADVENTURE_WORLDS.reduce((a, w) => a + w.levels * 3, 0);

/** Clave de un nivel: "nature-3" */
export const levelKey = (worldId: string, level: number) => `${worldId}-${level}`;

export function parseLevelKey(key: string): { world: AdventureWorld; level: number } | null {
  const match = /^([a-z]+)-(\d+)$/.exec(key);
  if (!match) return null;
  const world = ADVENTURE_WORLDS.find((w) => w.id === match[1]);
  const level = Number(match[2]);
  if (!world || level < 1 || level > world.levels) return null;
  return { world, level };
}

/** Dificultad sugerida del nivel: los primeros fáciles, los últimos difíciles. */
export function levelDifficulty(level: number): 'EASY' | 'MEDIUM' | 'HARD' {
  return level <= 2 ? 'EASY' : level <= 4 ? 'MEDIUM' : 'HARD';
}

/** Estrellas según la proporción de aciertos. */
export function starsFor(correct: number, total: number): number {
  if (total <= 0) return 0;
  const r = correct / total;
  return r >= 1 ? 3 : r >= 0.75 ? 2 : r >= 0.5 ? 1 : 0;
}

/** ¿Está desbloqueado un nivel? `stars` = estrellas por clave de nivel. */
export function isLevelUnlocked(key: string, stars: Record<string, number>): boolean {
  const parsed = parseLevelKey(key);
  if (!parsed) return false;
  const { world, level } = parsed;
  if (level > 1) return (stars[levelKey(world.id, level - 1)] ?? 0) > 0;
  const wi = ADVENTURE_WORLDS.indexOf(world);
  if (wi === 0) return true;
  const prev = ADVENTURE_WORLDS[wi - 1]!;
  return (stars[levelKey(prev.id, prev.levels)] ?? 0) > 0;
}
