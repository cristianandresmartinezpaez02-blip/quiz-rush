// Utilidades comunes para los Route Handlers del API (/api/*).
import 'server-only';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@quiz-rush/db';
import { auth } from './auth';
import { isBanned } from './ban';
import { observeRequest, routeLabel } from './metrics';
import { reportError } from './observability';
import { pushEnabled, pushSweep } from './push';
import { clientIp, rateLimit } from './ratelimit';

/** Error controlado que se convierte en una respuesta JSON con su código HTTP. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(code);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Envuelve un handler: convierte ApiError y ZodError en respuestas JSON consistentes y, tras
 * responder, da una oportunidad al repartidor de notificaciones push (como mucho cada 10 s).
 * Mide cada petición (métricas) y avisa de los errores inesperados (registro y Sentry).
 */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    if (pushEnabled()) after(() => pushSweep());
    const started = performance.now();
    const res = await run(handler, req, ctx);
    observeRequest(req, res.status, (performance.now() - started) / 1000);
    return res;
  };
}

async function run<C>(handler: Handler<C>, req: Request, ctx: C): Promise<Response> {
  try {
    return await handler(req, ctx);
  } catch (err) {
    if (err instanceof ApiError) {
      return json({ error: err.code, details: err.details }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return json({ error: 'VALIDATION', details: z.flattenError(err) }, { status: 400 });
    }
    reportError(err, { route: routeLabel(new URL(req.url).pathname), method: req.method });
    return json({ error: 'INTERNAL' }, { status: 500 });
  }
}

/** Exige sesión. Devuelve el usuario o lanza 401. */
export async function requireUser(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) throw new ApiError(401, 'UNAUTHORIZED');
  if (session.user.banned || (await isBanned(session.user.id))) throw new ApiError(403, 'BANNED');
  return session.user;
}

/**
 * Exige una cuenta real (no invitado). Calificar, comentar, seguir y reportar requieren cuenta
 * para frenar el spam; los invitados sí pueden guardar favoritos y colecciones.
 */
export async function requireAccount(req: Request) {
  const user = await requireUser(req);
  if (user.isAnonymous) throw new ApiError(403, 'ACCOUNT_REQUIRED');
  return user;
}

/**
 * Exige rol de administración (plugin admin de Better Auth: `user.role === 'admin'`). El rol se
 * confirma en la base de datos: la sesión en caché (cookie, 5 min) podría tener uno antiguo.
 */
export async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  const row = await db.user.findUnique({ where: { id: user.id }, select: { role: true } });
  if (row?.role !== 'admin') throw new ApiError(403, 'FORBIDDEN');
  return user;
}

/** Usuario actual si hay sesión (para endpoints públicos que personalizan la respuesta). */
export async function optionalUser(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user ?? null;
}

/** Aplica rate limiting; lanza 429 si se supera. */
export async function enforceRateLimit(
  req: Request,
  name: string,
  limit: number,
  windowSec: number,
  userId?: string,
) {
  const key = `${name}:${userId ?? clientIp(req.headers)}`;
  const result = await rateLimit(key, limit, windowSec);
  if (!result.ok) throw new ApiError(429, 'RATE_LIMITED', { retryAfter: result.resetSec });
}

/** Lee y valida el cuerpo JSON de la petición. */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON');
  }
  return schema.parse(body);
}
