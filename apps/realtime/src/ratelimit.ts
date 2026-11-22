// Limitación de frecuencia en los sockets.
//  • Por socket (memoria local: cada socket vive en una sola instancia): cubeta de fichas.
//  • Por IP para entrar a partidas (Redis: compartido entre instancias, frena bots).
import type { Redis } from 'ioredis';

/** Cubeta de fichas: `capacity` eventos de golpe, se recarga a `refillPerSec`. */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {
    this.tokens = capacity;
  }
  take(cost = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.last) / 1000) * this.refillPerSec,
    );
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Ventana fija en Redis. Si Redis falla, deja pasar (degradación elegante). */
export async function redisRateLimit(redis: Redis, key: string, limit: number, windowSec: number) {
  try {
    const bucket = `rl:rt:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const count = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, windowSec);
    return count <= limit;
  } catch {
    return true;
  }
}
