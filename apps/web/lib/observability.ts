// Registro de errores inesperados: en la consola (JSON en producción, para el colector de logs)
// y en Sentry si está configurado. Nunca incluye datos personales.
import 'server-only';

export function reportError(
  err: unknown,
  context: Record<string, string | number | undefined> = {},
) {
  const message = err instanceof Error ? err.message : String(err);
  if (process.env.NODE_ENV === 'production') {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: message,
        stack: err instanceof Error ? err.stack : undefined,
        ...context,
      }),
    );
  } else {
    console.error('[error]', context, err);
  }
  if (process.env.SENTRY_DSN) {
    void import('@sentry/nextjs')
      .then((Sentry) => Sentry.captureException(err, { tags: context as Record<string, string> }))
      .catch(() => {});
  }
}
