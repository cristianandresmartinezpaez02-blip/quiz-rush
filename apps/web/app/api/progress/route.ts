// GET /api/progress → panel de progreso (nivel, misiones, logros, liga, temporada, repaso)
import { json, requireUser, route } from '@/lib/api';
import { getProgress } from '@/lib/progress-service';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return json(await getProgress(user.id));
});
