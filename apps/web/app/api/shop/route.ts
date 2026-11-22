// GET /api/shop → artículos, monedas y avatar del jugador
import { json, requireUser, route } from '@/lib/api';
import { getShop } from '@/lib/progress-service';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return json(await getShop(user.id));
});
