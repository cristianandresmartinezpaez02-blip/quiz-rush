// Cliente Redis compartido por el API (caché, rate limiting y colas).
// Si Redis no está disponible, las funciones que dependen de él degradan con elegancia
// (fail-open) en lugar de tumbar la plataforma.
import 'server-only';
import { Redis } from 'ioredis';

const globalForRedis = globalThis as unknown as { __quizRushRedis?: Redis };

function createRedis(): Redis {
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: false,
    // Fallar rápido si Redis está caído (no encolar comandos indefinidamente)
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  let lastLog = 0;
  client.on('error', (err) => {
    // Evita inundar los logs mientras Redis está caído
    if (Date.now() - lastLog > 30_000) {
      lastLog = Date.now();
      console.error('[redis] error:', err.message);
    }
  });
  return client;
}

export const redis = globalForRedis.__quizRushRedis ?? createRedis();
if (process.env.NODE_ENV !== 'production') globalForRedis.__quizRushRedis = redis;

export function redisReady(): boolean {
  return redis.status === 'ready';
}
