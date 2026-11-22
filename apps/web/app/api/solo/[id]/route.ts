// GET /api/solo/:id → estado actual (para retomar tras recargar)
import { json, requireUser, route } from '@/lib/api';
import { getSolo } from '@/lib/solo-service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  return json(await getSolo(user.id, (await params).id));
});
