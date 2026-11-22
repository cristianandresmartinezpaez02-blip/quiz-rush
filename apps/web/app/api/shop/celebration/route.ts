// POST /api/shop/celebration { code | null } → elegir la celebración al ganar
import { z } from 'zod';
import { equipCelebration, ProgressError } from '@quiz-rush/db/progress';
import { ApiError, json, readJson, requireUser, route } from '@/lib/api';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { code } = await readJson(req, z.object({ code: z.string().max(60).nullable() }));
  try {
    await equipCelebration(user.id, code);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof ProgressError) throw new ApiError(err.status, err.code);
    throw err;
  }
});
