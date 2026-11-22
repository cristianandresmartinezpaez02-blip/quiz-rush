// GET /api/comments/:id/replies → respuestas de un comentario
import { json, optionalUser, route } from '@/lib/api';
import { listReplies } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const viewer = await optionalUser(req);
  const { id } = await params;
  return json({ items: await listReplies(id, viewer?.id) });
});
