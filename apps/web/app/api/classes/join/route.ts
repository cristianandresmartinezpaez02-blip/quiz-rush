// POST /api/classes/join { code } → unirse a una clase con su código
import { z } from 'zod';
import { classCodeSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { joinClass } from '@/lib/class-service';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  // Frena a quien intente adivinar códigos
  await enforceRateLimit(req, 'class-join', 10, 600, user.id);
  const { code } = await readJson(req, z.object({ code: classCodeSchema }));
  return json({ id: await joinClass(user.id, code) });
});
