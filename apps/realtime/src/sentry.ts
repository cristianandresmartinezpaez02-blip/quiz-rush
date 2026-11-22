// Errores a Sentry (solo si hay SENTRY_DSN). Sin datos personales.
import * as Sentry from '@sentry/node';

let enabled = false;

export function initSentry() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    serverName: 'realtime',
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
  });
  enabled = true;
}

export function captureError(err: unknown, tags: Record<string, string> = {}) {
  if (enabled) Sentry.captureException(err, { tags: { service: 'realtime', ...tags } });
}

/** Antes de salir: envía lo pendiente (máx. 2 s). */
export async function flushSentry() {
  if (enabled) await Sentry.flush(2000).catch(() => false);
}
