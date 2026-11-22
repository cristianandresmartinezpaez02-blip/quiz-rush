// DELETE /api/comments/:id → borrar comentario (su autor o el autor del quiz)
import { json, requireUser, route } from '@/lib/api';
import { deleteComment } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  await deleteComment(user.id, id);
  return json({ ok: true });
});
