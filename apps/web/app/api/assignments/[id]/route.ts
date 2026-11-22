// DELETE /api/assignments/:id → borrar una tarea (solo profe)
import { json, requireUser, route } from '@/lib/api';
import { deleteAssignment } from '@/lib/class-service';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  await deleteAssignment(user.id, (await params).id);
  return json({ ok: true });
});
