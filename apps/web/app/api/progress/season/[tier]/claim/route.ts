// POST /api/progress/season/:tier/claim → cobrar un nivel del pase de temporada
import { claimSeasonTier, ProgressError } from '@quiz-rush/db/progress';
import { ApiError, enforceRateLimit, json, requireUser, route } from '@/lib/api';

type Ctx = { params: Promise<{ tier: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'claim', 30, 60, user.id);
  const tier = Number((await params).tier);
  if (!Number.isInteger(tier) || tier < 1) throw new ApiError(400, 'VALIDATION');
  try {
    return json(await claimSeasonTier(user.id, tier));
  } catch (err) {
    if (err instanceof ProgressError) throw new ApiError(err.status, err.code);
    throw err;
  }
});
