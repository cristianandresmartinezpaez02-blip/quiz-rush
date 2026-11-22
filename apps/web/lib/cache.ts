// Caché de consultas en Redis (compartida por todas las réplicas del API).
// Si Redis falla, se ejecuta la consulta directamente: la caché nunca rompe la plataforma.
import 'server-only';
import { redis, redisReady } from './redis';

const PREFIX = 'cache:';

/** Cálculos en curso por clave (por instancia): evita la "estampida" al caducar una entrada. */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Devuelve el valor cacheado o lo calcula con `fn` y lo guarda `ttlSec` segundos.
 * Si muchas peticiones a la vez no encuentran la clave, solo UNA ejecuta `fn` (single-flight):
 * las demás esperan su resultado, así la base de datos recibe una consulta y no cientos.
 */
export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  if (redisReady()) {
    try {
      const hit = await redis.get(PREFIX + key);
      if (hit !== null) return JSON.parse(hit, reviveDates) as T;
    } catch {
      /* Redis no disponible: seguimos sin caché */
    }
  }
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const job = (async () => {
    const value = await fn();
    if (redisReady()) {
      redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSec).catch(() => {});
    }
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Copia en memoria por instancia (`cachedMany` y `memo`). `invalidate` también la limpia. */
const memory = new Map<string, { value: unknown; until: number }>();

/**
 * Varias claves a la vez: primero la copia en memoria de esta instancia (`memoryMs`), después
 * Redis (una sola ida para todas) y solo lo que falte se calcula con `load` y se guarda
 * `ttlSec` segundos. Sin Redis, todo se calcula.
 */
export async function cachedMany<T>(
  keys: string[],
  ttlSec: number,
  load: (missing: string[]) => Promise<Map<string, T>>,
  { memoryMs = 0 }: { memoryMs?: number } = {},
): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (!keys.length) return out;
  const now = Date.now();
  for (const k of keys) {
    const m = memory.get(k);
    if (m && m.until > now) out.set(k, m.value as T);
  }
  const fromRedis = keys.filter((k) => !out.has(k));
  if (fromRedis.length && redisReady()) {
    try {
      const hits = await redis.mget(fromRedis.map((k) => PREFIX + k));
      hits.forEach((h, i) => h !== null && out.set(fromRedis[i]!, JSON.parse(h, reviveDates) as T));
    } catch {
      /* sin Redis: se calcula todo */
    }
  }
  if (memoryMs > 0) {
    if (memory.size > 5000) memory.clear(); // tope de seguridad
    for (const k of fromRedis) {
      if (out.has(k)) memory.set(k, { value: out.get(k), until: now + memoryMs });
    }
  }
  const missing = keys.filter((k) => !out.has(k));
  if (!missing.length) return out;
  // Single-flight por clave: si otra petición ya está cargando una clave, se espera esa carga
  const waits: Promise<unknown>[] = [];
  const toLoad: string[] = [];
  for (const k of missing) {
    const pending = inflight.get(k) as Promise<T | undefined> | undefined;
    if (pending) waits.push(pending.then((v) => v !== undefined && out.set(k, v)));
    else toLoad.push(k);
  }
  if (toLoad.length) {
    const batch = load(toLoad).then((loaded) => {
      if (redisReady() && loaded.size) {
        // Caducidad con algo de azar: así las claves no vencen todas a la vez
        const multi = redis.multi();
        for (const [k, v] of loaded)
          multi.set(PREFIX + k, JSON.stringify(v), 'EX', ttlSec + Math.floor(Math.random() * 10));
        multi.exec().catch(() => {});
      }
      return loaded;
    });
    for (const k of toLoad) {
      const one = batch
        .then((m) => {
          const v = m.get(k);
          if (memoryMs > 0 && v !== undefined)
            memory.set(k, { value: v, until: Date.now() + memoryMs });
          return v;
        })
        .finally(() => inflight.delete(k));
      inflight.set(k, one);
      waits.push(one.then((v) => v !== undefined && out.set(k, v)));
    }
  }
  await Promise.all(waits);
  return out;
}

/**
 * Invalida una o varias claves exactas. Invalidar la ficha pública de un quiz
 * (`quiz:public:<id>`) borra también su tarjeta de la Biblioteca (`card:<id>`): así cualquier
 * cambio que ya refrescaba la ficha (favoritos, valoraciones, comentarios, publicar, ocultar…)
 * refresca también los contadores de las búsquedas.
 */
export async function invalidate(...keys: string[]) {
  if (!redisReady() || keys.length === 0) return;
  const all = keys.flatMap((k) =>
    k.startsWith('quiz:public:') ? [k, `card:${k.slice(12)}`] : [k],
  );
  for (const k of all) memory.delete(k);
  // Si cambia un quiz, las búsquedas ya montadas en memoria de esta instancia dejan de valer
  if (all.some((k) => k.startsWith('card:'))) {
    for (const k of memory.keys()) if (k.startsWith('page:')) memory.delete(k);
  }
  await redis.del(...all.map((k) => PREFIX + k)).catch(() => {});
}

// ── Versiones: invalidar de golpe todas las claves de un grupo (p. ej. las búsquedas) ──

const versionMemo = new Map<string, { v: number; at: number }>();

/** Versión actual de un grupo de claves (se memoriza 2 s por instancia para no ir a Redis siempre). */
export async function cacheVersion(group: string): Promise<number> {
  const memo = versionMemo.get(group);
  if (memo && Date.now() - memo.at < 2000) return memo.v;
  let v = 0;
  if (redisReady()) {
    try {
      v = Number((await redis.get(`${PREFIX}ver:${group}`)) ?? 0);
    } catch {
      /* sin Redis: versión 0 */
    }
  }
  versionMemo.set(group, { v, at: Date.now() });
  return v;
}

/** Sube la versión: todas las claves del grupo dejan de usarse (caducan solas). */
export async function bumpVersion(group: string) {
  versionMemo.delete(group);
  if (!redisReady()) return;
  await redis.incr(`${PREFIX}ver:${group}`).catch(() => {});
}

/**
 * Ejecuta `fn` como mucho una vez cada `everySec` en todo el clúster (candado en Redis).
 * Sin Redis no se ejecuta, para evitar que todas las réplicas lo hagan a la vez.
 */
export async function runAtMostEvery(name: string, everySec: number, fn: () => Promise<unknown>) {
  if (!redisReady()) return;
  try {
    const acquired = await redis.set(`lock:${name}`, '1', 'EX', everySec, 'NX');
    if (acquired === 'OK') await fn();
  } catch (err) {
    console.error(`[cache] tarea periódica "${name}" falló:`, err);
  }
}

// Las fechas se serializan como texto ISO: se recuperan como Date al leer de la caché
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
function reviveDates(_key: string, value: unknown) {
  return typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;
}

/**
 * Resultado en memoria de esta instancia durante `ms` (sin Redis). Para claves que empiezan por
 * `page:`, `invalidate` de cualquier quiz las borra: así un cambio se ve al instante en la
 * instancia que lo recibe y, en las demás, como mucho `ms` después.
 */
export async function memo<T>(key: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const m = memory.get(key);
  if (m && m.until > Date.now()) return m.value as T;
  const value = await fn();
  if (memory.size > 5000) memory.clear();
  memory.set(key, { value, until: Date.now() + ms });
  return value;
}
