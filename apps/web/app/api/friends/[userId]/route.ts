// POST /api/friends/:userId { action } → aceptar, rechazar, cancelar, quitar, bloquear o desbloquear
import { friendActionSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireAccount, route } from '@/lib/api';
import { friendAction } from '@/lib/social-service';

type Ctx = { params: Promise<{ userId: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'friend-action', 60, 600, user.id);
  const { action } = await readJson(req, friendActionSchema);
  return json(await friendAction(user.id, (await params).userId, action));
});
