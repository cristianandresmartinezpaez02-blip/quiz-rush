// POST /api/users/:id/follow → seguir · DELETE → dejar de seguir (requiere cuenta)
import { enforceRateLimit, json, requireAccount, route } from '@/lib/api';
import { setFollow } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

const handler = (on: boolean) =>
  route<Ctx>(async (req, { params }) => {
    const user = await requireAccount(req);
    await enforceRateLimit(req, 'follow', 30, 60, user.id);
    const { id } = await params;
    return json(await setFollow(user.id, id, on));
  });

export const POST = handler(true);
export const DELETE = handler(false);
