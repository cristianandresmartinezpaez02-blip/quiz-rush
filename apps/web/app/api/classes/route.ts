// GET  /api/classes → mis clases (como profe y como estudiante)
// POST /api/classes → crear una clase
import { createClassSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireAccount, requireUser, route } from '@/lib/api';
import { createClass, listMyClasses } from '@/lib/class-service';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return json(await listMyClasses(user.id));
});

export const POST = route(async (req) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'class-create', 10, 3600, user.id);
  return json(await createClass(user.id, await readJson(req, createClassSchema)), { status: 201 });
});
