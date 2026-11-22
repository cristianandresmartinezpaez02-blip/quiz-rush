// POST /api/collections/:id/items { quizId } → añadir · DELETE { quizId } → quitar
import { z } from 'zod';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { setCollectionItem } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ quizId: z.string().min(1).max(64) });

const handler = (on: boolean) =>
  route<Ctx>(async (req, { params }) => {
    const user = await requireUser(req);
    await enforceRateLimit(req, 'collection-item', 60, 60, user.id);
    const { id } = await params;
    const { quizId } = await readJson(req, bodySchema);
    await setCollectionItem(user.id, id, quizId, on);
    return json({ ok: true });
  });

export const POST = handler(true);
export const DELETE = handler(false);
