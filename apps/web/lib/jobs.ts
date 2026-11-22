// Cola de trabajos en segundo plano (BullMQ) vista desde la web.
//
//  • Si el worker (`apps/worker`) está vivo —deja un latido en Redis—, los trabajos se encolan
//    y él los ejecuta con reintentos, aunque nadie esté usando la web.
//  • Si no hay worker (despliegue mínimo o desarrollo sin él), la web los hace ella misma tras
//    responder (`after`), como en las fases anteriores. Así nunca se pierden.
import 'server-only';
import { Queue } from 'bullmq';
import {
  JOB_QUEUE,
  WORKER_HEARTBEAT_KEY,
  type JobName,
  type NotifyFollowersJob,
  type SearchIndexJob,
} from '@quiz-rush/shared';
import { redis } from './redis';

let aliveCache: { value: boolean; at: number } | null = null;

/** ¿Hay un worker vivo? (se consulta Redis como mucho cada 5 s por instancia) */
export async function workerAlive(): Promise<boolean> {
  if (aliveCache && Date.now() - aliveCache.at < 5000) return aliveCache.value;
  let value = false;
  try {
    value = (await redis.exists(WORKER_HEARTBEAT_KEY)) === 1;
  } catch {
    value = false;
  }
  aliveCache = { value, at: Date.now() };
  return value;
}

const globalForQueue = globalThis as unknown as { __quizRushQueue?: Queue };

function queue(): Queue {
  if (!globalForQueue.__quizRushQueue) {
    globalForQueue.__quizRushQueue = new Queue(JOB_QUEUE, {
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        // BullMQ exige reintentos ilimitados en su conexión
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    });
  }
  return globalForQueue.__quizRushQueue;
}

type Payloads = {
  'notify-followers': NotifyFollowersJob;
  'search-index': SearchIndexJob;
};

/**
 * Encola un trabajo puntual. Devuelve false si no hay worker (quien llama lo hace en línea).
 * `jobId` evita duplicados (p. ej. un mismo quiz publicado dos veces seguidas).
 */
export async function enqueue<N extends keyof Payloads & JobName>(
  name: N,
  data: Payloads[N],
  jobId?: string,
): Promise<boolean> {
  if (!(await workerAlive())) return false;
  try {
    await queue().add(name, data, jobId ? { jobId } : undefined);
    return true;
  } catch (err) {
    console.error(`[jobs] no se pudo encolar ${name}:`, (err as Error).message);
    return false;
  }
}
