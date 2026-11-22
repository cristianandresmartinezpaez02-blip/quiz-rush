// DELETE /api/classes/:id/members/:userId → el profe expulsa a alguien, o un estudiante sale
import { json, requireUser, route } from '@/lib/api';
import { leaveClass, removeMember } from '@/lib/class-service';

type Ctx = { params: Promise<{ id: string; userId: string }> };

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id, userId } = await params;
  if (userId === user.id) await leaveClass(user.id, id);
  else await removeMember(user.id, id, userId);
  return json({ ok: true });
});
