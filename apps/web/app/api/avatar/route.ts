// PUT /api/avatar { config } → guardar el avatar (solo piezas gratuitas o compradas)
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ProgressError, saveAvatar } from '@quiz-rush/db/progress';
import { ApiError, enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'avatar', 30, 60, user.id);
  const { config } = await readJson(req, z.object({ config: z.record(z.string(), z.unknown()) }));
  try {
    const saved = await saveAvatar(user.id, config);
    revalidatePath('/', 'layout');
    return json({ config: saved });
  } catch (err) {
    if (err instanceof ProgressError) throw new ApiError(err.status, err.code);
    throw err;
  }
});
