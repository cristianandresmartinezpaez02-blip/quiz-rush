// GET /api/ai → estado de la IA (activa, simulada o apagada) y generaciones que te quedan hoy
import { json, optionalUser, route } from '@/lib/api';
import { aiStatus, remainingGenerations } from '@/lib/ai/client';

export const GET = route(async (req) => {
  const user = await optionalUser(req);
  const status = aiStatus();
  return json({
    status,
    remaining: user && status !== 'off' ? await remainingGenerations(user.id) : 0,
  });
});
