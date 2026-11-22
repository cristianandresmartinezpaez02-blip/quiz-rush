// Errores del navegador a Sentry (solo si hay NEXT_PUBLIC_SENTRY_DSN; sin datos personales).
// Se carga bajo demanda: sin DSN, nadie descarga el SDK.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@sentry/nextjs').then((Sentry) =>
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Sin datos personales: Sentry v11 lo recoge todo por defecto, aquí se limita al mínimo
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { allow: ['user-agent', 'content-type'] }, response: false },
        httpBodies: [],
        urlQueryParams: false,
      },
      tracesSampleRate: 0.02,
      // Ruido conocido de extensiones y redes móviles
      ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection captured', 'Load failed'],
    }),
  );
}

export {};
