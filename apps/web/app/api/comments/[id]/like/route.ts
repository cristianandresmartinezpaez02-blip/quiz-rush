// POST /api/comments/:id/like → me gusta · DELETE → quitar
import { enforceRateLimit, json, requireAccount, route } from '@/lib/api';
import { setCommentLike } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

const handler = (on: boolean) =>
  route<Ctx>(async (req, { params }) => {
    const user = await requireAccount(req);
    await enforceRateLimit(req, 'comment-like', 60, 60, user.id);
    const { id } = await params;
    return json(await setCommentLike(user.id, id, on));
  });

export const POST = handler(true);
export const DELETE = handler(false);
