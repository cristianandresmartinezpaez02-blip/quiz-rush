// GET /health → estado del servicio para el balanceador de carga.
import { db } from '@quiz-rush/db';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

async function check(fn: () => Promise<unknown>, timeoutMs = 1500): Promise<'up' | 'down'> {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
}

export async function GET() {
  const [database, cache] = await Promise.all([
    check(() => db.$queryRaw`SELECT 1`),
    check(async () => {
      // Recién arrancado, la conexión puede estar estableciéndose: esperar a que esté lista
      if (redis.status !== 'ready') {
        await new Promise<void>((resolve) => {
          redis.once('ready', () => resolve());
          setTimeout(resolve, 1000);
        });
      }
      return redis.ping();
    }),
  ]);
  // Sin base de datos el servicio no puede atender: 503. Sin Redis funciona degradado: 200.
  const status = database === 'up' ? (cache === 'up' ? 'ok' : 'degraded') : 'down';
  return Response.json(
    { status, service: 'web', database, redis: cache, time: new Date().toISOString() },
    { status: database === 'up' ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
