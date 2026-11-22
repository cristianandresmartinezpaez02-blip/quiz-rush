// POST /api/games { quizId, settings? } → crea una partida en vivo y devuelve su id.
// El anfitrión abre después /host/:id; el servidor de tiempo real asigna el PIN.
import { createGameSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { createGame } from '@/lib/game-service';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'game-create', 10, 60, user.id);
  const { quizId, settings } = await readJson(req, createGameSchema);
  const gameId = await createGame(user.id, quizId, settings);
  return json({ gameId }, { status: 201 });
});
