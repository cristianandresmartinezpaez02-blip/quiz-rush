// Worker de Quiz_Rush (BullMQ): trabajos periódicos y puntuales con reintentos.
//
//  • Programa los periódicos (push cada 10 s, moderación cada 2 min, tendencia cada 10 min,
//    cierre de ligas cada hora, limpieza diaria). BullMQ garantiza una sola ejecución por
//    turno aunque haya varias réplicas del worker.
//  • Ejecuta los puntuales que encola la web (avisos a seguidores por lotes, índice de búsqueda).
//  • Cada trabajo llama a su ruta interna en la web (/api/internal/jobs/<nombre>).
//  • Anuncia que está vivo en Redis: mientras lo esté, la web deja de hacer estas tareas en línea.
//  • /health y /metrics (Prometheus) en WORKER_PORT (4100).
import { createServer } from 'node:http';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import {
  JOB_NAMES,
  JOB_QUEUE,
  JOB_SCHEDULES,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SECONDS,
  type JobName,
} from '@quiz-rush/shared';
import { jobDuration, jobItems, jobsTotal, queueDepth, registry } from './metrics';
import { runJob } from './runner';
import { captureError, flushSentry, initSentry } from './sentry';

initSentry();

const isDev = process.env.NODE_ENV !== 'production';
const log = pino({
  name: 'worker',
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  }),
});

const config = {
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  webUrl: process.env.WEB_INTERNAL_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.JOBS_SECRET ?? '',
  port: Number(process.env.WORKER_PORT ?? 4100),
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
};

async function main() {
  if (config.secret.length < 16) {
    log.fatal('Falta JOBS_SECRET (mín. 16 caracteres) en .env: ejecuta `npm run setup`');
    process.exit(1);
  }
  const connection = { url: config.redisUrl, maxRetriesPerRequest: null };
  const queue = new Queue(JOB_QUEUE, { connection });
  const heartbeat = new Redis(config.redisUrl, { maxRetriesPerRequest: 1 });

  // Trabajos periódicos (idempotente: actualiza la programación si cambió)
  for (const [name, every] of Object.entries(JOB_SCHEDULES) as [JobName, number][]) {
    await queue.upsertJobScheduler(
      `every:${name}`,
      { every },
      {
        name,
        opts: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      },
    );
  }

  const worker = new Worker(
    JOB_QUEUE,
    async (job: Job) => {
      const name = job.name as JobName;
      if (!(JOB_NAMES as readonly string[]).includes(name))
        throw new Error(`Trabajo desconocido: ${name}`);
      const end = jobDuration.startTimer({ name });
      try {
        const result = await runJob(
          { webUrl: config.webUrl, secret: config.secret },
          name,
          job.data,
        );
        if (result.done) jobItems.inc({ name }, result.done);
        // Lote siguiente (p. ej. los próximos 1.000 seguidores)
        if (result.next) await queue.add(name, result.next);
        jobsTotal.inc({ name, status: 'ok' });
        if (result.done || name !== 'push')
          log.debug({ name, done: result.done }, 'trabajo completado');
        return result;
      } catch (err) {
        jobsTotal.inc({ name, status: 'error' });
        log.warn(
          { name, attempt: job.attemptsMade + 1, err: (err as Error).message },
          'trabajo fallido',
        );
        // A Sentry solo el último intento (los anteriores se reintentan solos)
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) captureError(err, { job: name });
        throw err;
      } finally {
        end();
      }
    },
    { connection, concurrency: config.concurrency },
  );
  worker.on('error', (err) => log.error({ err: err.message }, 'error del worker'));

  // Latido: mientras exista, la web delega en el worker
  const beat = () =>
    heartbeat
      .set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', WORKER_HEARTBEAT_TTL_SECONDS)
      .catch((err: Error) => log.warn({ err: err.message }, 'no se pudo renovar el latido'));
  await beat();
  const beatTimer = setInterval(() => void beat(), 10_000);

  // Profundidad de la cola para las métricas
  const depthTimer = setInterval(async () => {
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      for (const [state, n] of Object.entries(counts)) queueDepth.set({ state }, n);
    } catch {
      /* Redis momentáneamente caído */
    }
  }, 15_000);

  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(worker.isRunning() ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: worker.isRunning() }));
      return;
    }
    if (req.url === '/metrics') {
      res.writeHead(200, { 'content-type': registry.contentType });
      res.end(await registry.metrics());
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(config.port, () =>
    log.info(
      { port: config.port, web: config.webUrl, concurrency: config.concurrency },
      '⚙️  Worker listo',
    ),
  );

  // Apagado ordenado: termina los trabajos en curso y deja de anunciarse
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Cerrando worker…');
    clearInterval(beatTimer);
    clearInterval(depthTimer);
    server.close();
    await worker.close();
    await heartbeat.del(WORKER_HEARTBEAT_KEY).catch(() => {});
    await Promise.all([queue.close(), heartbeat.quit().catch(() => {})]);
    await flushSentry();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.fatal({ err }, 'No se pudo iniciar el worker');
  process.exit(1);
});
