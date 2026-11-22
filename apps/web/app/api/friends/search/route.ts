// GET /api/friends/search?q= → personas para añadir como amigas
import { enforceRateLimit, json, requireAccount, route } from '@/lib/api';
import { searchPeople } from '@/lib/social-service';

export const GET = route(async (req) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'people-search', 60, 60, user.id);
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 40);
  return json({ items: await searchPeople(user.id, q) });
});
