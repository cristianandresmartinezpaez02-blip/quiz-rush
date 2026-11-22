// Avatar del perfil: un personaje original dibujado por capas (cuerpo, ojos, boca, sombrero,
// ropa y marco). Las piezas gratuitas están disponibles para todos; el resto se compra en la tienda.
import { z } from 'zod';

export const AVATAR_COLORS = [
  '#22d3ee',
  '#a3e635',
  '#fb923c',
  '#f472b6',
  '#a78bfa',
  '#2dd4bf',
  '#ffe14d',
  '#e5484d',
  '#94a3b8',
  '#f5f5f4',
] as const;

/** Piezas por ranura. `free` = disponibles sin comprar. */
export const AVATAR_PARTS = {
  body: { free: ['blob', 'bean'], shop: ['ghost', 'cube', 'robot', 'star', 'dragon'] },
  eyes: { free: ['happy', 'round', 'sleepy'], shop: ['wink', 'cool', 'stars', 'hearts'] },
  mouth: { free: ['smile', 'open', 'neutral'], shop: ['tongue', 'fangs', 'grin'] },
  hat: {
    free: ['none'],
    shop: ['cap', 'party', 'flower', 'headphones', 'horns', 'wizard', 'halo', 'crown', 'laurel'],
  },
  outfit: { free: ['none'], shop: ['bowtie', 'scarf', 'hoodie', 'cape', 'medal', 'spacesuit'] },
  frame: { free: ['none', 'simple'], shop: ['neon', 'gold', 'rainbow', 'flames', 'season1'] },
} as const;

export type AvatarSlot = keyof typeof AVATAR_PARTS;
export const AVATAR_SLOTS = Object.keys(AVATAR_PARTS) as AvatarSlot[];

const allParts = (slot: AvatarSlot) =>
  [...AVATAR_PARTS[slot].free, ...AVATAR_PARTS[slot].shop] as [string, ...string[]];

export const avatarConfigSchema = z.object({
  body: z.enum(allParts('body')).default('blob'),
  color: z.enum(AVATAR_COLORS).default('#22d3ee'),
  eyes: z.enum(allParts('eyes')).default('happy'),
  mouth: z.enum(allParts('mouth')).default('smile'),
  hat: z.enum(allParts('hat')).default('none'),
  outfit: z.enum(allParts('outfit')).default('none'),
  frame: z.enum(allParts('frame')).default('none'),
});
export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

export const DEFAULT_AVATAR: AvatarConfig = avatarConfigSchema.parse({});

/** Lee cualquier avatar guardado (incluidos los antiguos) como configuración válida. */
export function normalizeAvatar(raw: unknown): AvatarConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const parsed = avatarConfigSchema.shape[k as keyof AvatarConfig]?.safeParse(v);
    if (parsed?.success) out[k] = parsed.data;
  }
  // Avatares de la Fase 1: { base: 'blob', color, eyes: 'happy' }
  if (value.base === 'blob' && !out.body) out.body = 'blob';
  return avatarConfigSchema.parse(out);
}

/** Código del artículo de tienda que desbloquea una pieza. */
export const avatarItemCode = (slot: AvatarSlot, part: string) => `${slot}:${part}`;

export function isFreePart(slot: AvatarSlot, part: string): boolean {
  return (AVATAR_PARTS[slot].free as readonly string[]).includes(part);
}

/** Piezas del avatar que el jugador no posee (para validar al guardar). */
export function lockedParts(config: AvatarConfig, owned: ReadonlySet<string>): string[] {
  return AVATAR_SLOTS.filter((slot) => {
    const part = config[slot];
    return !isFreePart(slot, part) && !owned.has(avatarItemCode(slot, part));
  }).map((slot) => avatarItemCode(slot, config[slot]));
}
