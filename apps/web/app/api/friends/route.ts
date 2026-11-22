// GET  /api/friends → amigos (con presencia), solicitudes y bloqueados
// POST /api/friends { username } → enviar solicitud de amistad
import { friendRequestSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireAccount, requireUser, route } from '@/lib/api';
import { listFriends, sendFriendRequest } from '@/lib/social-service';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return json(await listFriends(user.id));
});

export const POST = route(async (req) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'friend-request', 20, 600, user.id);
  const { username } = await readJson(req, friendRequestSchema);
  return json(await sendFriendRequest(user.id, username));
});
