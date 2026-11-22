// Repartidor de push: texto en el idioma de cada persona, solo tipos con push, limpieza de
// suscripciones caducadas (410) y nada de envíos si no hay claves VAPID.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: { endpoint: string; payload: Record<string, string> }[] = [];
const deleted: string[][] = [];

vi.mock('server-only', () => ({}));
vi.mock('../lib/cache', () => ({
  runAtMostEvery: async (_n: string, _s: number, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('web-push', () => {
  class WebPushError extends Error {
    constructor(public statusCode: number) {
      super('push');
    }
  }
  return {
    WebPushError,
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      if (sub.endpoint.includes('gone')) throw new WebPushError(410);
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    }),
  };
});

const claimed = [
  {
    id: 'n1',
    userId: 'es-user',
    type: 'FRIEND_REQUEST',
    data: { actorName: 'Leo', actorUsername: 'leo' },
  },
  { id: 'n2', userId: 'en-user', type: 'GAME_INVITE', data: { actorName: 'Sofi', pin: '123456' } },
  // Este tipo no se envía por push (solo campana)
  {
    id: 'n3',
    userId: 'es-user',
    type: 'NEW_QUIZ',
    data: { actorName: 'Ana', quizTitle: 'Planetas' },
  },
];

vi.mock('@quiz-rush/db', () => ({
  db: {
    $queryRaw: vi.fn(async () => claimed),
    notification: { updateMany: vi.fn(async () => ({ count: 0 })) },
    pushSubscription: {
      findMany: vi.fn(async () => [
        { id: 's1', userId: 'es-user', endpoint: 'https://push.test/es', p256dh: 'k', auth: 'a' },
        { id: 's2', userId: 'en-user', endpoint: 'https://push.test/en', p256dh: 'k', auth: 'a' },
        { id: 's3', userId: 'en-user', endpoint: 'https://push.test/gone', p256dh: 'k', auth: 'a' },
      ]),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        deleted.push(where.id.in);
        return { count: where.id.in.length };
      }),
    },
    profile: {
      findMany: vi.fn(async () => [
        { userId: 'es-user', locale: 'es' },
        { userId: 'en-user', locale: 'en' },
      ]),
    },
  },
}));

describe('repartidor de push', () => {
  beforeEach(() => {
    sent.length = 0;
    deleted.length = 0;
    vi.resetModules();
  });

  it('sin claves VAPID no envía nada', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    const { deliverPendingPush, pushEnabled } = await import('../lib/push');
    expect(pushEnabled()).toBe(false);
    expect(await deliverPendingPush()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('envía en el idioma de cada persona, salta los tipos sin push y borra suscripciones caducadas', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'pub');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
    const { deliverPendingPush } = await import('../lib/push');
    expect(await deliverPendingPush()).toBe(2);

    const es = sent.find((s) => s.endpoint.endsWith('/es'))!;
    expect(es.payload.body).toBe('Leo quiere ser tu amigo');
    expect(es.payload.url).toBe('/amigos');

    const en = sent.find((s) => s.endpoint.endsWith('/en'))!;
    expect(en.payload.body).toContain('Sofi invited you to a live game');
    expect(en.payload.body).toContain('123456');
    expect(en.payload.url).toBe('/jugar?pin=123456');

    // NEW_QUIZ no se envió
    expect(sent.every((s) => !(s.payload.body ?? '').includes('Planetas'))).toBe(true);
    // La suscripción que respondió 410 se borra
    expect(deleted).toEqual([['s3']]);
  });
});
