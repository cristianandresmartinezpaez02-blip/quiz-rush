// Métricas Prometheus de la web (GET /api/metrics con `Authorization: Bearer <METRICS_TOKEN>`).
// Cada réplica expone las suyas; Prometheus las suma. En plataformas serverless (Vercel) cada
// función es efímera: allí se usan sus paneles y estas métricas sirven en despliegues con
// contenedores.
import 'server-only';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

const globalForMetrics = globalThis as unknown as {
  __quizRushMetrics?: {
    registry: Registry;
    requests: Counter<string>;
    duration: Histogram<string>;
  };
};

function create() {
  const registry = new Registry();
  registry.setDefaultLabels({ service: 'web' });
  collectDefaultMetrics({ register: registry });
  return {
    registry,
    requests: new Counter({
      name: 'quizrush_http_requests_total',
      help: 'Peticiones al API por ruta, método y código',
      labelNames: ['route', 'method', 'status'],
      registers: [registry],
    }),
    duration: new Histogram({
      name: 'quizrush_http_request_seconds',
      help: 'Duración de las peticiones al API por ruta',
      labelNames: ['route', 'method'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
  };
}

// En desarrollo el módulo se recarga: se reutiliza el mismo registro
export const metrics = (globalForMetrics.__quizRushMetrics ??= create());

/**
 * Ruta sin datos variables (para no crear una serie por cada id):
 * /api/quizzes/cmx123abc/export → /api/quizzes/:id/export
 */
export function routeLabel(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) =>
      /^[0-9]+$/.test(seg) || /^[a-z0-9]{20,}$/i.test(seg) || /^[0-9a-f-]{32,36}$/i.test(seg)
        ? ':id'
        : seg,
    )
    .join('/')
    .slice(0, 80);
}

export function observeRequest(req: Request, status: number, seconds: number) {
  const route = routeLabel(new URL(req.url).pathname);
  metrics.requests.inc({ route, method: req.method, status: String(status) });
  metrics.duration.observe({ route, method: req.method }, seconds);
}
