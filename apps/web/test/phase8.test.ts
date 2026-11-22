// Fase 8: reglas de seguridad de la caché de páginas, IP de confianza y etiquetas de métricas.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('server-only', () => ({}));
vi.mock('../lib/redis', () => ({
  redisReady: () => true,
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
  },
}));

vi.stubEnv('PAGE_CACHE_SECONDS', '30');
const renders = vi.fn(
  async () =>
    new Response('<html lang="es">anónima</html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
);
vi.stubGlobal('fetch', renders);

const { proxy } = await import('../proxy');
const { clientIp } = await import('../lib/ratelimit');
const { routeLabel } = await import('../lib/metrics');

const BROWSER = { accept: 'text/html,application/xhtml+xml', 'sec-fetch-dest': 'document' };
const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${path}`, { headers });

describe('caché de páginas para visitantes sin sesión (proxy.ts)', () => {
  beforeEach(() => {
    store.clear();
    renders.mockClear();
  });

  it('la primera visita renderiza y guarda; las siguientes salen de la caché', async () => {
    const a = await proxy(req('/biblioteca', BROWSER));
    expect(a.headers.get('x-page-cache')).toBe('MISS');
    expect(await a.text()).toContain('anónima');
    const b = await proxy(req('/biblioteca', BROWSER));
    expect(b.headers.get('x-page-cache')).toMatch(/^HIT/);
    expect(renders).toHaveBeenCalledTimes(1);
    expect(b.headers.get('cache-control')).toBe('private, no-cache');
  });

  it('con cookie de sesión (o de invitado) nunca usa la caché', async () => {
    const r = await proxy(
      req('/biblioteca', { ...BROWSER, cookie: 'better-auth.session_token=abc' }),
    );
    expect(r.headers.get('x-page-cache')).toBeNull();
    expect(renders).not.toHaveBeenCalled();
  });

  it('las peticiones internas de navegación de React no reciben HTML', async () => {
    const r = await proxy(req('/biblioteca', { accept: '*/*', 'sec-fetch-dest': 'empty' }));
    expect(r.headers.get('x-page-cache')).toBeNull();
    const r2 = await proxy(req('/biblioteca', { accept: 'text/html', 'sec-fetch-dest': 'empty' }));
    expect(r2.headers.get('x-page-cache')).toBeNull();
  });

  it('cada idioma tiene su propia copia', async () => {
    await proxy(req('/', { ...BROWSER, 'accept-language': 'en-US,en;q=0.9' }));
    await proxy(req('/', { ...BROWSER, cookie: 'NEXT_LOCALE=es' }));
    expect([...store.keys()].sort()).toEqual(['page:en:/', 'page:es:/']);
  });

  it('no guarda respuestas que no son 200 ni las que ponen cookies', async () => {
    renders.mockResolvedValueOnce(
      new Response('no', { status: 404, headers: { 'content-type': 'text/html' } }),
    );
    await proxy(req('/quiz/nope', BROWSER));
    renders.mockResolvedValueOnce(
      new Response('x', { headers: { 'content-type': 'text/html', 'set-cookie': 'a=b' } }),
    );
    await proxy(req('/quiz/otro', BROWSER));
    expect(store.size).toBe(0);
  });
});

describe('IP de confianza', () => {
  it('la cabecera del proxy (x-real-ip) manda sobre X-Forwarded-For', () => {
    const h = new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' });
    expect(clientIp(h)).toBe('203.0.113.7');
    // Sin la cabecera de confianza: primer valor de X-Forwarded-For (para no bloquear a todos)
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('etiquetas de métricas', () => {
  it('los ids no crean una serie por cada recurso', () => {
    expect(routeLabel('/api/quizzes/cmwk5dsmx0007e8ukrvfhbsiv/export')).toBe(
      '/api/quizzes/:id/export',
    );
    expect(routeLabel('/api/users/2a9f6403-0d9d-479c-8e30-019a91bdd70f')).toBe('/api/users/:id');
    expect(routeLabel('/api/library')).toBe('/api/library');
  });
});
