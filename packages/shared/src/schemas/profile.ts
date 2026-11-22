// Esquemas del perfil público del usuario.
import { z } from 'zod';
import { LIMITS } from '../constants';
import { containsProfanity } from '../moderation/profanity';

const noProfanity = (v: string) => !containsProfanity(v);
const noProfanityStrict = (v: string) => !containsProfanity(v, { strict: true });

export const usernameSchema = z
  .string()
  .trim()
  .min(LIMITS.username.min)
  .max(LIMITS.username.max)
  .regex(/^[a-zA-Z0-9_]+$/, 'USERNAME_CHARS')
  .refine(noProfanityStrict, 'OFFENSIVE');

export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z
    .string()
    .trim()
    .min(LIMITS.displayName.min)
    .max(LIMITS.displayName.max)
    .refine(noProfanityStrict, 'OFFENSIVE')
    .optional(),
  bio: z.string().trim().max(LIMITS.bio.max).refine(noProfanity, 'OFFENSIVE').nullish(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullish(),
  locale: z.enum(['es', 'en']).optional(),
  reduceMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  extraTimePercent: z.number().int().min(0).max(100).optional(),
  soundEnabled: z.boolean().optional(),
  textScale: z.union([z.literal(100), z.literal(115), z.literal(130)]).optional(),
  showOnline: z.boolean().optional(),
  allowFriendRequests: z.boolean().optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Genera un nombre de usuario a partir de un nombre o email, apto para el esquema. */
export function suggestUsername(source: string): string {
  const base =
    source
      .split('@')[0]!
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 14) || 'rusher';
  const padded = base.length < LIMITS.username.min ? `${base}_qr` : base;
  return `${padded}${Math.floor(1000 + Math.random() * 9000)}`;
}
