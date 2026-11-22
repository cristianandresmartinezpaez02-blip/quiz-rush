// GET /api/admin/stats → métricas del panel
import { json, requireAdmin, route } from '@/lib/api';
import { adminStats } from '@/lib/admin-service';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json(await adminStats());
});
