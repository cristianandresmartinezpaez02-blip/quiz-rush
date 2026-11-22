// Esquemas de la Biblioteca y de las acciones de la comunidad.
import { z } from 'zod';
import { DIFFICULTIES, LANGUAGES } from '../constants';
import { containsProfanity } from '../moderation/profanity';
import { QUESTION_TYPES } from '../questions/types';
import { CATEGORY_IDS } from '../catalog/categories';

export const LIBRARY_SORTS = ['trending', 'popular', 'top', 'new', 'relevance'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** Duración aproximada del quiz (en segundos estimados). */
export const DURATION_BUCKETS = {
  short: { max: 180 },
  medium: { min: 180, max: 600 },
  long: { min: 600 },
} as const;
export type DurationBucket = keyof typeof DURATION_BUCKETS;

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

/** Parámetros de búsqueda de la Biblioteca (llegan por la URL: todos opcionales). */
export const libraryQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  category: z.preprocess(
    emptyToUndefined,
    z.enum(CATEGORY_IDS as [string, ...string[]]).optional(),
  ),
  language: z.preprocess(emptyToUndefined, z.enum(LANGUAGES).optional()),
  difficulty: z.preprocess(emptyToUndefined, z.enum(DIFFICULTIES).optional()),
  duration: z.preprocess(emptyToUndefined, z.enum(['short', 'medium', 'long']).optional()),
  type: z.preprocess(emptyToUndefined, z.enum(QUESTION_TYPES).optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(LIBRARY_SORTS).optional()),
  cursor: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  limit: z.coerce.number().int().min(1).max(48).optional(),
});
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;

/** ¿La búsqueda tiene algún filtro activo? (si no, se muestran las secciones tipo Netflix) */
export function hasLibraryFilters(q: LibraryQuery): boolean {
  return !!(q.q || q.category || q.language || q.difficulty || q.duration || q.type || q.sort);
}

export const ratingSchema = z.object({ stars: z.number().int().min(1).max(5) });

export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine((v) => !containsProfanity(v), 'OFFENSIVE'),
  parentId: z.string().max(64).nullish(),
});

export const collectionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine((v) => !containsProfanity(v), 'OFFENSIVE'),
  description: z.string().trim().max(280).nullish(),
  isPublic: z.boolean().optional(),
});

export const REPORT_REASONS = [
  'OFFENSIVE',
  'SPAM',
  'WRONG_ANSWERS',
  'COPYRIGHT',
  'INAPPROPRIATE',
  'OTHER',
] as const;

export const reportSchema = z.object({
  targetType: z.enum(['QUIZ', 'COMMENT', 'USER']),
  targetId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).nullish(),
});

/** Número de reportes abiertos que ocultan automáticamente un quiz hasta que lo revise un admin. */
export const AUTO_HIDE_REPORT_THRESHOLD = 5;

/**
 * Media bayesiana: (C·m + suma) / (C + n). Con pocas notas tiende a la media global m;
 * con muchas, a la media real. Así "mejor calificados" no lo gana un quiz con una sola nota.
 */
export function bayesianRating(sum: number, count: number, prior = 3.5, weight = 5): number {
  return (prior * weight + sum) / (weight + count);
}

/**
 * Puntuación de tendencia (estilo "Hacker News"): la actividad suma y la antigüedad resta.
 */
export function trendingScore(input: {
  plays: number;
  favorites: number;
  ratings: number;
  ratingAvg: number;
  comments: number;
  hoursSincePublish: number;
}): number {
  const activity =
    input.plays +
    3 * input.favorites +
    2 * input.ratings * (input.ratingAvg / 5) +
    1.5 * input.comments +
    1;
  return activity / Math.pow(input.hoursSincePublish + 2, 1.5);
}
