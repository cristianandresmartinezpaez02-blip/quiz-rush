// Fase 7: códigos de club, esquemas sociales y preferencias de accesibilidad.
import { describe, expect, it } from 'vitest';
import {
  clubCodeSchema,
  createClubSchema,
  friendActionSchema,
  gameInviteSchema,
  generateClubCode,
  presenceSchema,
  profileUpdateSchema,
  pushSubscriptionSchema,
  PUSH_NOTIFICATION_TYPES,
} from '../src';

describe('clubes', () => {
  it('los códigos generados son válidos y sin caracteres confusos', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateClubCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(clubCodeSchema.parse(code.toLowerCase())).toBe(code);
    }
    // 0/O y 1/I no existen en el alfabeto
    expect(clubCodeSchema.safeParse('DEMO2345').success).toBe(false);
    expect(clubCodeSchema.safeParse('RUSH2345').success).toBe(true);
  });

  it('crear club: valores por defecto y filtro de lenguaje ofensivo', () => {
    const club = createClubSchema.parse({ name: '  Los Cerebritos ' });
    expect(club).toMatchObject({
      name: 'Los Cerebritos',
      isPublic: true,
      emoji: '🛡️',
      color: '#7c5cff',
    });
    expect(createClubSchema.safeParse({ name: 'ab' }).success).toBe(false);
    expect(createClubSchema.safeParse({ name: 'Club', color: '#000000' }).success).toBe(false);
  });
});

describe('amigos y presencia', () => {
  it('acciones y actividades válidas', () => {
    expect(friendActionSchema.safeParse({ action: 'block' }).success).toBe(true);
    expect(friendActionSchema.safeParse({ action: 'hack' }).success).toBe(false);
    expect(presenceSchema.parse({}).activity).toBe('online');
    expect(presenceSchema.safeParse({ activity: 'sleeping' }).success).toBe(false);
  });

  it('invitar: PIN de 6-7 cifras y como mucho 20 amigos', () => {
    expect(gameInviteSchema.safeParse({ friendIds: ['a'], pin: '123456' }).success).toBe(true);
    expect(gameInviteSchema.safeParse({ friendIds: ['a'], pin: '12ab56' }).success).toBe(false);
    expect(
      gameInviteSchema.safeParse({ friendIds: Array(21).fill('a'), pin: '123456' }).success,
    ).toBe(false);
  });
});

describe('push y preferencias', () => {
  it('suscripción push con endpoint y claves', () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/x',
        keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
      }).success,
    ).toBe(true);
    expect(
      pushSubscriptionSchema.safeParse({ endpoint: 'no-url', keys: { p256dh: 'x', auth: 'y' } })
        .success,
    ).toBe(false);
    expect(PUSH_NOTIFICATION_TYPES).toContain('GAME_INVITE');
  });

  it('tamaño de texto solo 100, 115 o 130', () => {
    expect(profileUpdateSchema.safeParse({ textScale: 115 }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ textScale: 120 }).success).toBe(false);
  });
});
