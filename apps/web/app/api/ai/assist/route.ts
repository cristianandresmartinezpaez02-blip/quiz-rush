// POST /api/ai/assist → sugerir distractores o escribir la explicación de una pregunta
import { enforceRateLimit, json, readJson, requireAccount, route } from '@/lib/api';
import { assist, assistRequestSchema } from '@/lib/ai/assist';

export const maxDuration = 120;

export const POST = route(async (req) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'ai-assist', 20, 60, user.id);
  return json(await assist(user.id, await readJson(req, assistRequestSchema)));
});
