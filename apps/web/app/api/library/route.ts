// GET /api/library?q=&category=&language=&difficulty=&duration=&type=&sort=&cursor=
// Búsqueda de la Biblioteca General con filtros y paginación por cursor (pública).
import { libraryQuerySchema } from '@quiz-rush/shared';
import { after } from 'next/server';
import { moderationSweep } from '@/lib/ai/moderate';
import { enforceRateLimit, json, route } from '@/lib/api';
import { searchLibrary } from '@/lib/library-service';

export const GET = route(async (req) => {
  // Búsqueda instantánea: se permite ráfaga alta, pero se frena el abuso por IP
  await enforceRateLimit(req, 'library-search', 120, 60);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = libraryQuerySchema.parse(params);
  // Revisión con IA de lo publicado pendiente (como mucho cada 2 minutos en todo el clúster)
  after(() =>
    moderationSweep().catch((err) => console.error('[moderación] barrido fallido:', err)),
  );
  return json(await searchLibrary(query), {
    headers: { 'cache-control': 'public, s-maxage=15, stale-while-revalidate=60' },
  });
});
