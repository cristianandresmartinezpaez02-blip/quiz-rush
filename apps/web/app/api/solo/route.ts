// POST /api/solo { mode, … } → empezar una partida individual
import { soloStartSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { startSolo } from '@/lib/solo-service';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'solo-start', 30, 60, user.id);
  const input = await readJson(req, soloStartSchema);
  return json(await startSolo(user, input), { status: 201 });
});
