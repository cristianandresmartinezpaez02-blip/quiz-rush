// Arranque del servidor de Next: errores a Sentry (solo si hay SENTRY_DSN).
// Sin datos personales: ni IP, ni cookies, ni cabeceras, ni cuerpos (dataCollection y filtro propio).
import type { Instrumentation } from 'next';

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    // Sin datos personales: Sentry v11 lo recoge todo por defecto, aquí se limita al mínimo
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['user-agent', 'content-type'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    // Trazas de rendimiento muestreadas (subir solo si hace falta: cuestan cuota)
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
        }
      }
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
}

// Errores de renderizado y de rutas que Next no muestra en la respuesta
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
};
