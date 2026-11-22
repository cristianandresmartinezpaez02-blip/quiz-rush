// POST /api/solo/:id/next → siguiente pregunta (el reloj empieza ahora)
import { json, requireUser, route } from '@/lib/api';
import { nextSolo } from '@/lib/solo-service';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  return json(await nextSolo(user.id, (await params).id));
});
