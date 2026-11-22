// Caché de varias claves: lee de Redis, carga solo lo que falta, una sola carga por clave aunque
// la pidan muchas peticiones a la vez, y al invalidar la ficha de un quiz se borra su tarjeta.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const deleted: string[] = [];
vi.mock('server-only', () => ({}));
vi.mock('../lib/redis', () => ({
  redisReady: () => true,
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    mget: vi.fn(async (keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async (...keys: string[]) => {
      deleted.push(...keys);
      return keys.length;
    }),
    multi: () => {
      const ops: [string, string][] = [];
      const m = {
        set: (k: string, v: string) => {
          ops.push([k, v]);
          return m;
        },
        exec: async () => {
          for (const [k, v] of ops) store.set(k, v);
          return [];
        },
      };
      return m;
    },
  },
}));

const { cachedMany, invalidate, memo } = await import('../lib/cache');

describe('cachedMany', () => {
  beforeEach(() => {
    store.clear();
    deleted.length = 0;
  });

  it('carga solo lo que falta y lo guarda', async () => {
    store.set('cache:card:a', JSON.stringify({ id: 'a', n: 1 }));
    const load = vi.fn(
      async (missing: string[]) => new Map(missing.map((k) => [k, { id: k, n: 2 }])),
    );
    const out = await cachedMany(['card:a', 'card:b'], 30, load);
    expect(load).toHaveBeenCalledWith(['card:b']);
    expect(out.get('card:a')).toEqual({ id: 'a', n: 1 });
    expect(out.get('card:b')).toEqual({ id: 'card:b', n: 2 });
    expect(store.has('cache:card:b')).toBe(true);
  });

  it('muchas peticiones simultáneas: una sola carga por clave', async () => {
    let calls = 0;
    const load = async (missing: string[]) => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return new Map(missing.map((k) => [k, k]));
    };
    const results = await Promise.all(
      Array.from({ length: 50 }, () => cachedMany(['card:x'], 30, load)),
    );
    expect(calls).toBe(1);
    expect(results.every((r) => r.get('card:x') === 'card:x')).toBe(true);
  });

  it('lo que la carga no devuelve (p. ej. un quiz oculto) no aparece', async () => {
    const out = await cachedMany(['card:oculto'], 30, async () => new Map());
    expect(out.has('card:oculto')).toBe(false);
  });

  it('invalidar la ficha de un quiz borra también su tarjeta', async () => {
    await invalidate('quiz:public:q1', 'otra');
    expect(deleted).toEqual(['cache:quiz:public:q1', 'cache:card:q1', 'cache:otra']);
  });

  it('cambiar un quiz vacía las búsquedas guardadas en memoria', async () => {
    let n = 0;
    const run = () => memo('page:search:x', 60_000, async () => ++n);
    expect(await run()).toBe(1);
    expect(await run()).toBe(1);
    await invalidate('quiz:public:q9');
    expect(await run()).toBe(2);
  });
});
