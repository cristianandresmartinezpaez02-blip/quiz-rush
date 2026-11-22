// POST /api/progress/missions/:id/claim → cobrar una misión completada
import { claimMission } from '@quiz-rush/db/progress';
import { ApiError, enforceRateLimit, json, requireUser, route } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'claim', 30, 60, user.id);
  const { id } = await params;
  const res = await claimMission(user.id, id);
  if (res.error) throw new ApiError(res.error === 'NOT_FOUND' ? 404 : 409, res.error);
  return json(res.outcome);
});
