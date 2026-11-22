// POST /api/classes/:id/assignments → crear una tarea (solo profe)
import { createAssignmentSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireUser, route } from '@/lib/api';
import { createAssignment } from '@/lib/class-service';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'assignment-create', 30, 3600, user.id);
  const input = await readJson(req, createAssignmentSchema);
  return json({ id: await createAssignment(user.id, (await params).id, input) }, { status: 201 });
});
