// POST /api/quizzes/:id/favorite → guardar en favoritos · DELETE → quitar
import { enforceRateLimit, json, requireUser, route } from '@/lib/api';
import { setFavorite } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

const handler = (on: boolean) =>
  route<Ctx>(async (req, { params }) => {
    const user = await requireUser(req);
    await enforceRateLimit(req, 'favorite', 60, 60, user.id);
    const { id } = await params;
    await setFavorite(user.id, id, on);
    return json({ favorited: on });
  });

export const POST = handler(true);
export const DELETE = handler(false);
