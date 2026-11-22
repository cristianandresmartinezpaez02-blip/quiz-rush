// POST /api/shop/buy { code } → comprar con monedas
import { z } from 'zod';
import { buyItem, ProgressError } from '@quiz-rush/db/progress';
import { ApiError, enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'shop', 30, 60, user.id);
  const { code } = await readJson(req, z.object({ code: z.string().min(1).max(60) }));
  try {
    return json(await buyItem(user.id, code));
  } catch (err) {
    if (err instanceof ProgressError) throw new ApiError(err.status, err.code);
    throw err;
  }
});
