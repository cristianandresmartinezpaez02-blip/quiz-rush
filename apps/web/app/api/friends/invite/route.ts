// POST /api/friends/invite { friendIds, pin } → invitar amigos a una partida en vivo
import { gameInviteSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { inviteToGame } from '@/lib/social-service';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'game-invite', 10, 60, user.id);
  const { friendIds, pin } = await readJson(req, gameInviteSchema);
  return json(await inviteToGame(user.id, friendIds, pin));
});
