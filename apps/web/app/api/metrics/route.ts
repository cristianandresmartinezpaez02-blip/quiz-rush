// GET /api/metrics → métricas Prometheus de esta réplica. Exige `Bearer <METRICS_TOKEN>`;
// sin token configurado, la ruta no existe.
import { timingSafeEqual } from 'node:crypto';
import { metrics } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN ?? '';
  const header = req.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (
    !token ||
    given.length !== token.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(token))
  ) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(await metrics.registry.metrics(), {
    headers: { 'content-type': metrics.registry.contentType, 'cache-control': 'no-store' },
  });
}
