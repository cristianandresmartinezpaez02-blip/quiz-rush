// Rate limiting por ventana fija en Redis (compartido entre todas las réplicas del API).
import 'server-only';
import { redis, redisReady } from './redis';

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Segundos hasta que se reinicia la ventana */
  resetSec: number;
}

/**
 * Cuenta una petición para `key` y dice si está dentro del límite.
 * @param key     identificador (p. ej. "autosave:user_123" o "login:ip_1.2.3.4")
 * @param limit   peticiones permitidas por ventana
 * @param windowSec duración de la ventana en segundos
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  // Degradación elegante: sin Redis no bloqueamos a nadie.
  if (!redisReady()) return { ok: true, limit, remaining: limit, resetSec: windowSec };

  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const redisKey = `rl:${key}:${bucket}`;
  try {
    const [[, count], [, ttl]] = (await redis.multi().incr(redisKey).ttl(redisKey).exec()) as [
      [null, number],
      [null, number],
    ];
    if (ttl < 0) await redis.expire(redisKey, windowSec);
    return {
      ok: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetSec: ttl > 0 ? ttl : windowSec,
    };
  } catch {
    return { ok: true, limit, remaining: limit, resetSec: windowSec };
  }
}

/**
 * IP del cliente detrás del balanceador / CDN.
 *
 * Se confía en la cabecera que pone (y sobrescribe) el proxy de delante, CLIENT_IP_HEADER: si se
 * leyera cualquiera, un atacante podría inventarse una IP distinta en cada petición y saltarse
 * los límites (p. ej. de inicio de sesión). Por defecto "x-real-ip" (nginx, Railway); en Render
 * (detrás de Cloudflare) "true-client-ip"; con Cloudflare propio "cf-connecting-ip".
 *
 * Si esa cabecera no llega (proxy mal configurado), se usa el primer valor de X-Forwarded-For y
 * se avisa en el registro: es falsificable, pero la alternativa —todos los visitantes con la
 * misma "IP"— bloquearía la web entera al primer límite.
 */
const IP_HEADER = (process.env.CLIENT_IP_HEADER || 'x-real-ip').toLowerCase();
let warned = false;

export function clientIp(headers: Headers): string {
  const raw = headers.get(IP_HEADER);
  if (raw) {
    // x-forwarded-for como cabecera de confianza: el ÚLTIMO valor lo añadió nuestro proxy
    const value = IP_HEADER === 'x-forwarded-for' ? raw.split(',').at(-1) : raw;
    return value?.trim().slice(0, 64) || 'unknown';
  }
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) {
    if (!warned) {
      warned = true;
      console.warn(
        `[ip] No llega la cabecera "${IP_HEADER}" (CLIENT_IP_HEADER): uso X-Forwarded-For, que el cliente puede falsificar. Revisa la configuración del proxy.`,
      );
    }
    return forwarded.slice(0, 64);
  }
  return 'unknown';
}
