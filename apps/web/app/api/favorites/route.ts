// GET /api/favorites?cursor= → mis quizzes favoritos
import { json, requireUser, route } from '@/lib/api';
import { listFavorites } from '@/lib/community-service';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const cursor = new URL(req.url).searchParams.get('cursor') ?? undefined;
  return json(await listFavorites(user.id, cursor));
});
