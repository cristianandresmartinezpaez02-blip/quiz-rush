// POST   /api/clubs/:id/membership → entrar a un club público
// DELETE /api/clubs/:id/membership → salir del club
import { enforceRateLimit, json, requireAccount, route } from '@/lib/api';
import { joinPublicClub, leaveClub } from '@/lib/club-service';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'club-join', 10, 600, user.id);
  return json(await joinPublicClub(user.id, (await params).id));
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  return json(await leaveClub(user.id, (await params).id));
});
