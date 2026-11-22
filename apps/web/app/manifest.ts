// Manifiesto de la app instalable (PWA): nombre, iconos, colores y accesos directos.
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Quiz_Rush',
    short_name: 'Quiz_Rush',
    description:
      'Quizzes en tiempo real con alma de videojuego: crea, juega en vivo con PIN o solo, y sube de nivel.',
    lang: 'es',
    start_url: '/?origen=app',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#0e0b26',
    theme_color: '#0e0b26',
    categories: ['education', 'games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      {
        name: 'Unirse con PIN',
        short_name: 'Jugar',
        url: '/jugar',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Jugar solo',
        short_name: 'Solo',
        url: '/solo',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Crear un quiz',
        short_name: 'Crear',
        url: '/mis-quizzes',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
