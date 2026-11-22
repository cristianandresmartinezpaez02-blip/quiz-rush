// GET    /api/clubs/:id → club (miembros, ranking y quizzes)
// PATCH  /api/clubs/:id → editar (ADMIN/OWNER)
// DELETE /api/clubs/:id → borrar (OWNER)
import { updateClubSchema } from '@quiz-rush/shared';
import { json, optionalUser, readJson, requireAccount, route } from '@/lib/api';
import { deleteClub, getClub, updateClub } from '@/lib/club-service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await optionalUser(req);
  return json(await getClub({ id: (await params).id }, user?.id ?? null));
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  return json(await updateClub(user.id, (await params).id, await readJson(req, updateClubSchema)));
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  await deleteClub(user.id, (await params).id);
  return json({ ok: true });
});
