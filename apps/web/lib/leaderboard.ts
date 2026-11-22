// Rankings de los modos individuales (Rush del día, reto diario, desafíos) en Redis.
//
//  • Un Sorted Set por ranking (`lb:<soloKey>`): miembro = persona, puntuación = su MEJOR
//    resultado (ZADD GT). Top N y "mi puesto" cuestan O(log n), no un recorrido de la tabla.
//  • Los aciertos del mejor intento van en un hash al lado (`lbc:<soloKey>`).
//  • Postgres sigue siendo la fuente de verdad: si el ranking no está en Redis (caducó, Redis se
//    reinició…) se reconstruye desde la base de datos, con un candado para que solo lo haga una
//    petición. Si Redis está caído, se responde directamente desde Postgres.
import 'server-only';
import { db } from '@quiz-rush/db';
import { normalizeAvatar, type AvatarConfig } from '@quiz-rush/shared';
import { redis } from './redis';

const TTL_SECONDS = 9 * 86_400; // los desafíos duran hasta 7 días
const boardKey = (k: string) => `lb:${k}`;
const correctKey = (k: string) => `lbc:${k}`;
const builtKey = (k: string) => `lbm:${k}`;

export interface LeaderboardRow {
  userId: string;
  score: number;
  correct: number;
  username: string;
  displayName: string;
  avatar: AvatarConfig;
  position: number;
}

/** Mejor intento de cada persona, desde Postgres (fuente de verdad). */
async function bestFromDb(soloKey: string) {
  return db.$queryRaw<{ userId: string; score: number; correct: number }[]>`
    SELECT DISTINCT ON (p."userId") p."userId", p."score", p."correctCount" AS "correct"
    FROM "Player" p
    JOIN "GameSession" g ON g."id" = p."gameId"
    WHERE g."soloKey" = ${soloKey} AND g."status" = 'FINISHED' AND p."userId" IS NOT NULL
    ORDER BY p."userId", p."score" DESC, p."joinedAt" ASC`;
}

/** Garantiza que el ranking está en Redis (lo reconstruye si hace falta). */
async function ensureBoard(soloKey: string) {
  if (await redis.exists(builtKey(soloKey))) return;
  // Solo una petición reconstruye; las demás esperan un momento y leen lo que haya
  const lock = await redis.set(`lock:lb:${soloKey}`, '1', 'EX', 30, 'NX');
  if (!lock) {
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  try {
    const rows = await bestFromDb(soloKey);
    const multi = redis.multi().del(boardKey(soloKey), correctKey(soloKey));
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      multi.zadd(boardKey(soloKey), ...chunk.flatMap((r) => [r.score, r.userId]));
      multi.hset(correctKey(soloKey), ...chunk.flatMap((r) => [r.userId, String(r.correct)]));
    }
    multi
      .expire(boardKey(soloKey), TTL_SECONDS)
      .expire(correctKey(soloKey), TTL_SECONDS)
      .set(builtKey(soloKey), '1', 'EX', TTL_SECONDS);
    await multi.exec();
  } finally {
    await redis.del(`lock:lb:${soloKey}`);
  }
}

/** Apunta un resultado (solo cuenta si mejora el de esa persona). Devuelve su puesto. */
export async function recordScore(
  soloKey: string,
  userId: string,
  score: number,
  correct: number,
): Promise<number | null> {
  try {
    await ensureBoard(soloKey);
    // GT: solo actualiza si es mejor; CH: devuelve 1 si cambió (o es nuevo)
    const changed = await redis.zadd(boardKey(soloKey), 'GT', 'CH', score, userId);
    if (Number(changed) === 1) await redis.hset(correctKey(soloKey), userId, String(correct));
    await redis
      .multi()
      .expire(boardKey(soloKey), TTL_SECONDS)
      .expire(correctKey(soloKey), TTL_SECONDS)
      .exec();
    return await myPosition(soloKey, userId);
  } catch {
    return null; // sin Redis: quien llama usa Postgres
  }
}

/** Puesto (1 = primero) del mejor intento de una persona, o null si no jugó. */
export async function myPosition(soloKey: string, userId: string): Promise<number | null> {
  const rank = await redis.zrevrank(boardKey(soloKey), userId);
  return rank === null ? null : rank + 1;
}

async function hydrate(entries: { userId: string; score: number; correct: number }[]) {
  const people = await db.profile.findMany({
    where: { userId: { in: entries.map((e) => e.userId) } },
    select: {
      userId: true,
      username: true,
      displayName: true,
      user: { select: { avatar: { select: { config: true } } } },
    },
  });
  const byId = new Map(people.map((p) => [p.userId, p]));
  return entries
    .map((e, i) => {
      const p = byId.get(e.userId);
      return p
        ? {
            ...e,
            username: p.username,
            displayName: p.displayName,
            avatar: normalizeAvatar(p.user.avatar?.config),
            position: i + 1,
          }
        : null;
    })
    .filter((r): r is LeaderboardRow => !!r);
}

/** Los mejores `limit` de un ranking. */
export async function topScores(soloKey: string, limit = 20): Promise<LeaderboardRow[]> {
  try {
    await ensureBoard(soloKey);
    const flat = await redis.zrevrange(boardKey(soloKey), 0, limit - 1, 'WITHSCORES');
    const ids: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      ids.push(flat[i]!);
      scores.push(Number(flat[i + 1]));
    }
    const corrects = ids.length ? await redis.hmget(correctKey(soloKey), ...ids) : [];
    return hydrate(
      ids.map((userId, i) => ({ userId, score: scores[i]!, correct: Number(corrects[i] ?? 0) })),
    );
  } catch {
    // Redis caído: directo de Postgres
    const rows = (await bestFromDb(soloKey)).sort((a, b) => b.score - a.score).slice(0, limit);
    return hydrate(rows);
  }
}

/** Olvida un ranking en Redis (pruebas y mantenimiento): se reconstruirá al leerlo. */
export async function dropBoard(soloKey: string) {
  await redis.del(boardKey(soloKey), correctKey(soloKey), builtKey(soloKey)).catch(() => {});
}
