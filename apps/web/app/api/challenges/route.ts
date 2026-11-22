// POST /api/challenges { quizId, days } → crear un desafío por enlace
import { z } from 'zod';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { createChallenge } from '@/lib/solo-service';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'challenge', 20, 3600, user.id);
  const { quizId, days } = await readJson(
    req,
    z.object({
      quizId: z.string().min(1).max(64),
      days: z.number().int().min(1).max(14).default(3),
    }),
  );
  return json({ id: await createChallenge(user.id, quizId, days) }, { status: 201 });
});
