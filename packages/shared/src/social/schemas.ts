// Amigos, presencia, clubes, invitaciones a partidas y notificaciones push (Fase 7).
import { z } from 'zod';
import { containsProfanity } from '../moderation/profanity';
import { usernameSchema } from '../schemas/profile';

const clean = (v: string) => !containsProfanity(v, { strict: true });

// ───────────────────────── Amigos ─────────────────────────

/** Máximo de amigos por cuenta (evita listas enormes en la presencia). */
export const MAX_FRIENDS = 300;

export const friendRequestSchema = z.object({ username: usernameSchema });

export const friendActionSchema = z.object({
  action: z.enum(['accept', 'decline', 'remove', 'block', 'unblock', 'cancel']),
});
export type FriendAction = z.infer<typeof friendActionSchema>['action'];

// ───────────────────────── Presencia ─────────────────────────

/** Qué está haciendo un amigo (se muestra junto al punto verde). */
export const PRESENCE_ACTIVITIES = ['online', 'playing', 'hosting', 'solo', 'editing'] as const;
export type PresenceActivity = (typeof PRESENCE_ACTIVITIES)[number];

export const presenceSchema = z.object({
  activity: z.enum(PRESENCE_ACTIVITIES).default('online'),
});

/** Cada cuánto envía el navegador el latido y cuánto dura sin renovarlo. */
export const PRESENCE = { heartbeatMs: 45_000, ttlSeconds: 100 } as const;

/** Invitar a amigos a una partida en vivo (con su PIN) o a un duelo. */
export const gameInviteSchema = z.object({
  friendIds: z.array(z.string().min(1).max(64)).min(1).max(20),
  pin: z.string().regex(/^\d{6,7}$/),
});

// ───────────────────────── Clubes ─────────────────────────

export const CLUB_LIMITS = {
  name: { min: 3, max: 40 },
  description: 200,
  members: 200,
  quizzes: 60,
  owned: 5,
} as const;
export const CLUB_COLORS = [
  '#7c5cff',
  '#ff4fa3',
  '#22c55e',
  '#06b6d4',
  '#f59e0b',
  '#ef4444',
  '#3b82f6',
  '#a855f7',
] as const;
export const CLUB_EMOJIS = [
  '🛡️',
  '🚀',
  '🦊',
  '🐉',
  '🔥',
  '⚡',
  '🎯',
  '🧠',
  '🎮',
  '🌟',
  '🏆',
  '🦄',
] as const;

export const createClubSchema = z.object({
  name: z
    .string()
    .trim()
    .min(CLUB_LIMITS.name.min)
    .max(CLUB_LIMITS.name.max)
    .refine(clean, 'OFFENSIVE'),
  description: z.string().trim().max(CLUB_LIMITS.description).refine(clean, 'OFFENSIVE').optional(),
  emoji: z.enum(CLUB_EMOJIS).default('🛡️'),
  color: z.enum(CLUB_COLORS).default('#7c5cff'),
  isPublic: z.boolean().default(true),
});
export type CreateClubInput = z.infer<typeof createClubSchema>;

export const updateClubSchema = createClubSchema
  .partial()
  .extend({ newCode: z.boolean().optional() });

export const CLUB_CODE_LENGTH = 8;
export const clubCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[A-HJ-NP-Z2-9]{${CLUB_CODE_LENGTH}}$`), 'CLUB_CODE_INVALID');

/** Código de invitación de clubes privados (sin caracteres confusos: 0/O, 1/I). */
export function generateClubCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    { length: CLUB_CODE_LENGTH },
    () => alphabet[Math.floor(random() * alphabet.length)],
  ).join('');
}

export const clubMemberActionSchema = z.object({
  action: z.enum(['promote', 'demote', 'kick', 'transfer']),
});

// ───────────────────────── Notificaciones push ─────────────────────────

/** Tipos que se envían también como push (el resto solo aparecen en la campana). */
export const PUSH_NOTIFICATION_TYPES = [
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
  'GAME_INVITE',
  'CLUB_JOINED',
  'ASSIGNMENT',
  'COMMENT',
  'REPLY',
  'LEAGUE_RESULT',
  'LEVEL_UP',
  'ACHIEVEMENT',
  'QUIZ_HIDDEN',
] as const;

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
