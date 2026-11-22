// El worker llama a la ruta interna correcta, con el secreto, y lanza en errores (reintento).
import { describe, expect, it, vi } from 'vitest';
import { JobHttpError, runJob, timeoutFor } from '../src/runner';

describe('runJob', () => {
  it('llama a /api/internal/jobs/<nombre> con el secreto y devuelve el resultado', async () => {
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, done: 3 }), { status: 200 }),
    );
    const r = await runJob(
      { webUrl: 'http://web:3000/', secret: 's'.repeat(32), fetchFn },
      'push',
      {},
    );
    expect(r).toEqual({ ok: true, done: 3 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://web:3000/api/internal/jobs/push');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${'s'.repeat(32)}`);
  });

  it('un error HTTP lanza (BullMQ reintentará)', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }));
    await expect(
      runJob({ webUrl: 'http://web', secret: 'x'.repeat(16), fetchFn }, 'trending', {}),
    ).rejects.toBeInstanceOf(JobHttpError);
  });

  it('la moderación tiene más tiempo que el resto', () => {
    expect(timeoutFor('moderation')).toBeGreaterThan(timeoutFor('push'));
  });
});
