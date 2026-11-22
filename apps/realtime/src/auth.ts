// Verificación de los JWT emitidos por la app web (Better Auth, plugin "jwt").
// Las claves públicas se descargan del endpoint JWKS y se cachean: verificar un token
// no requiere consultar la base de datos ni llamar a la web en cada conexión.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './context';

const jwks = createRemoteJWKSet(new URL(config.jwksUrl ?? '/api/auth/jwks', config.webUrl), {
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60_000,
});

export interface AuthUser {
  userId: string;
  name: string | null;
  isAnonymous: boolean;
}

/** Devuelve el usuario del token o null si no es válido (firma, emisor, audiencia o caducidad). */
export async function verifyToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.webUrl,
      audience: config.jwtAudience,
    });
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : null,
      isAnonymous: payload.isAnonymous === true,
    };
  } catch {
    return null;
  }
}
