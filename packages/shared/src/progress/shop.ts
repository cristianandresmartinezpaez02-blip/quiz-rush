// Catálogo de la tienda. Todo se compra con monedas que se ganan jugando (no hay dinero real).
// Los artículos de temporada no se venden: se consiguen en el pase de temporada.
import { AVATAR_PARTS, avatarItemCode, type AvatarSlot } from './avatar';

export type ShopItemType =
  'AVATAR_BODY' | 'AVATAR_OUTFIT' | 'ACCESSORY' | 'FRAME' | 'CELEBRATION' | 'THEME' | 'POWERUP';
export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface ShopItemDef {
  code: string;
  type: ShopItemType;
  rarity: Rarity;
  price: number;
  /** Ranura del avatar y pieza (artículos de avatar) */
  slot?: AvatarSlot;
  part?: string;
  /** Efecto de celebración al ganar */
  celebration?: string;
  /** Solo se obtiene en el pase de temporada */
  seasonOnly?: boolean;
}

const SLOT_TYPE: Record<AvatarSlot, ShopItemType> = {
  body: 'AVATAR_BODY',
  eyes: 'ACCESSORY',
  mouth: 'ACCESSORY',
  hat: 'ACCESSORY',
  outfit: 'AVATAR_OUTFIT',
  frame: 'FRAME',
};

/** Precio y rareza de cada pieza de avatar a la venta. */
const PART_PRICES: Record<string, [number, Rarity]> = {
  'body:ghost': [250, 'RARE'],
  'body:cube': [300, 'RARE'],
  'body:robot': [500, 'EPIC'],
  'body:star': [600, 'EPIC'],
  'body:dragon': [1500, 'LEGENDARY'],
  'eyes:wink': [80, 'COMMON'],
  'eyes:cool': [150, 'RARE'],
  'eyes:stars': [250, 'RARE'],
  'eyes:hearts': [250, 'RARE'],
  'mouth:tongue': [60, 'COMMON'],
  'mouth:fangs': [120, 'COMMON'],
  'mouth:grin': [100, 'COMMON'],
  'hat:cap': [120, 'COMMON'],
  'hat:party': [100, 'COMMON'],
  'hat:flower': [120, 'COMMON'],
  'hat:headphones': [300, 'RARE'],
  'hat:horns': [350, 'RARE'],
  'hat:wizard': [500, 'EPIC'],
  'hat:halo': [600, 'EPIC'],
  'hat:crown': [1200, 'LEGENDARY'],
  'hat:laurel': [0, 'LEGENDARY'],
  'outfit:bowtie': [100, 'COMMON'],
  'outfit:scarf': [120, 'COMMON'],
  'outfit:hoodie': [250, 'RARE'],
  'outfit:cape': [450, 'EPIC'],
  'outfit:medal': [0, 'EPIC'],
  'outfit:spacesuit': [900, 'LEGENDARY'],
  'frame:neon': [300, 'RARE'],
  'frame:gold': [700, 'EPIC'],
  'frame:rainbow': [1000, 'LEGENDARY'],
  'frame:flames': [800, 'EPIC'],
  'frame:season1': [0, 'LEGENDARY'],
};

/** Piezas exclusivas del pase de temporada (precio 0, no se venden). */
const SEASON_ONLY = new Set(['hat:laurel', 'outfit:medal', 'frame:season1']);

export const CELEBRATIONS = ['confetti', 'fireworks', 'hearts', 'stars', 'emoji'] as const;
export type Celebration = (typeof CELEBRATIONS)[number];

const avatarItems: ShopItemDef[] = (Object.keys(AVATAR_PARTS) as AvatarSlot[]).flatMap((slot) =>
  AVATAR_PARTS[slot].shop.map((part) => {
    const code = avatarItemCode(slot, part);
    const [price, rarity] = PART_PRICES[code] ?? [200, 'COMMON'];
    return {
      code,
      type: SLOT_TYPE[slot],
      rarity,
      price,
      slot,
      part,
      ...(SEASON_ONLY.has(code) && { seasonOnly: true }),
    } satisfies ShopItemDef;
  }),
);

const celebrationItems: ShopItemDef[] = [
  {
    code: 'celebration:fireworks',
    type: 'CELEBRATION',
    rarity: 'RARE',
    price: 300,
    celebration: 'fireworks',
  },
  {
    code: 'celebration:hearts',
    type: 'CELEBRATION',
    rarity: 'COMMON',
    price: 200,
    celebration: 'hearts',
  },
  {
    code: 'celebration:stars',
    type: 'CELEBRATION',
    rarity: 'EPIC',
    price: 450,
    celebration: 'stars',
  },
  {
    code: 'celebration:emoji',
    type: 'CELEBRATION',
    rarity: 'RARE',
    price: 350,
    celebration: 'emoji',
  },
];

export const SHOP_ITEMS: readonly ShopItemDef[] = [...avatarItems, ...celebrationItems];

export function shopItem(code: string): ShopItemDef | undefined {
  return SHOP_ITEMS.find((i) => i.code === code);
}

export const RARITY_COLOR: Record<Rarity, string> = {
  COMMON: '#94a3b8',
  RARE: '#22d3ee',
  EPIC: '#a78bfa',
  LEGENDARY: '#ffe14d',
};
