// IP del cliente para los límites (unirse a partidas). Se confía en la cabecera que pone y
// sobrescribe el proxy de delante (CLIENT_IP_HEADER, por defecto x-real-ip; en Render
// true-client-ip). Si no llega, se usa el primer valor de X-Forwarded-For (falsificable, pero
// mejor que meter a todos los jugadores en el mismo límite) y se avisa una vez.
import type { IncomingHttpHeaders } from 'node:http';

const IP_HEADER = (process.env.CLIENT_IP_HEADER || 'x-real-ip').toLowerCase();
let warned = false;

const first = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw);

export function clientIpFrom(headers: IncomingHttpHeaders): string | undefined {
  const value = first(headers[IP_HEADER]);
  if (value) {
    // x-forwarded-for como cabecera de confianza: el ÚLTIMO valor lo añadió nuestro proxy
    const ip = IP_HEADER === 'x-forwarded-for' ? value.split(',').at(-1) : value;
    return ip?.trim().slice(0, 64) || undefined;
  }
  const forwarded = first(headers['x-forwarded-for'])?.split(',')[0]?.trim();
  if (forwarded && !warned) {
    warned = true;
    console.warn(
      `[ip] No llega la cabecera "${IP_HEADER}" (CLIENT_IP_HEADER): uso X-Forwarded-For.`,
    );
  }
  return forwarded?.slice(0, 64) || undefined;
}
