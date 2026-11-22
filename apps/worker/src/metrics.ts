// Métricas Prometheus del worker (GET /metrics): trabajos por resultado, duración y cola.
import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'worker' });
collectDefaultMetrics({ register: registry });

export const jobsTotal = new Counter({
  name: 'quizrush_jobs_total',
  help: 'Trabajos ejecutados por nombre y resultado',
  labelNames: ['name', 'status'] as const,
  registers: [registry],
});

export const jobDuration = new Histogram({
  name: 'quizrush_job_duration_seconds',
  help: 'Duración de los trabajos',
  labelNames: ['name'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

export const jobItems = new Counter({
  name: 'quizrush_job_items_total',
  help: 'Elementos procesados por los trabajos (avisos enviados, quizzes revisados…)',
  labelNames: ['name'] as const,
  registers: [registry],
});

export const queueDepth = new Gauge({
  name: 'quizrush_queue_jobs',
  help: 'Trabajos en la cola por estado',
  labelNames: ['state'] as const,
  registers: [registry],
});
