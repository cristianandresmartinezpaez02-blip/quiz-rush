// POST /api/solo/:id/finish → terminar (fin del Rush o abandonar) y cobrar la recompensa
import { json, requireUser, route } from '@/lib/api';
import { finishSolo } from '@/lib/solo-service';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  return json(await finishSolo(user.id, (await params).id));
});
