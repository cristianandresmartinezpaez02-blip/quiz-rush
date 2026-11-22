import path from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import createNextIntlPlugin from 'next-intl/plugin';

// Las variables de entorno se cargan desde el .env de la raíz del monorepo
// en los scripts de package.json (node ../../scripts/with-env.mjs next …).

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // Paquetes internos del monorepo escritos en TypeScript
  transpilePackages: ['@quiz-rush/shared', '@quiz-rush/db'],
  serverExternalPackages: ['pg', 'ioredis', 'nodemailer', 'web-push'],
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
      {
        // El service worker nunca se guarda en caché: así cada despliegue llega a todos
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

/**
 * `next dev` y `next build` usan carpetas distintas. Si comparten `.next`, después de un build
 * de producción la caché de Turbopack en desarrollo queda inconsistente y el navegador entra en
 * un bucle de recargas ("HMR hash mismatch"). Con carpetas separadas nunca se pisan.
 */
export default function config(phase: string): NextConfig {
  return withNextIntl({
    ...nextConfig,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  });
}
