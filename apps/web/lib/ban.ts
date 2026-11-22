// Bloqueo inmediato de cuentas. Better Auth guarda la sesión en una cookie firmada durante
// 5 minutos (cookieCache): borrar las sesiones de la base de datos no basta para echar al
// instante a quien se bloquea. Esta lista en Redis se consulta en cada petición y dura más que
// esa caché; pasado ese tiempo ya no hay sesiones válidas y el login rechaza la cuenta.
import 'server-only';
import { redis } from './redis';

const key = (userId: string) => `banned:${userId}`;
const TTL_SECONDS = 3600;

export async function markBanned(userId: string, banned: boolean) {
  try {
    if (banned) await redis.set(key(userId), '1', 'EX', TTL_SECONDS);
    else await redis.del(key(userId));
  } catch {
    /* sin Redis: las sesiones ya se borraron; caducan con la caché de la cookie */
  }
}

export async function isBanned(userId: string) {
  try {
    return (await redis.exists(key(userId))) === 1;
  } catch {
    return false;
  }
}
