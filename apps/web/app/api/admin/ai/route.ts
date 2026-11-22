// GET /api/admin/ai → uso de la IA por día y tipo (últimos 14 días)
import { json, requireAdmin, route } from '@/lib/api';
import { aiUsage } from '@/lib/admin-service';

export const GET = route(async (req) => {
  await requireAdmin(req);
  return json({ items: await aiUsage() });
});
