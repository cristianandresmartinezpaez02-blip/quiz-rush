// POST /api/clubs/join { code } → entrar a un club privado con su código
import { z } from 'zod';
import { clubCodeSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireAccount, route } from '@/lib/api';
import { joinClubByCode } from '@/lib/club-service';

export const POST = route(async (req) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'club-join', 10, 600, user.id);
  const { code } = await readJson(req, z.object({ code: clubCodeSchema }));
  return json(await joinClubByCode(user.id, code));
});
