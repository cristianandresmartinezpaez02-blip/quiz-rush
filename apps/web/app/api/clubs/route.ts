// GET  /api/clubs?q= → mis clubes + clubes públicos
// POST /api/clubs → crear un club
import { createClubSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, optionalUser, readJson, requireAccount, route } from '@/lib/api';
import { createClub, listClubs } from '@/lib/club-service';

export const GET = route(async (req) => {
  const user = await optionalUser(req);
  const q = new URL(req.url).searchParams.get('q')?.slice(0, 40);
  return json(await listClubs(user?.id ?? null, q));
});

export const POST = route(async (req) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'club-create', 5, 3600, user.id);
  return json(await createClub(user.id, await readJson(req, createClubSchema)), { status: 201 });
});
