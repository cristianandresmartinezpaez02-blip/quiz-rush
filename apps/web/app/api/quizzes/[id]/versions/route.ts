// GET  /api/quizzes/:id/versions → historial de versiones
// POST /api/quizzes/:id/versions → guarda una versión manual
import { enforceRateLimit, json, requireUser, route } from '@/lib/api';
import { createManualVersion, listVersions } from '@/lib/quiz-service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return json({ items: await listVersions(id, user.id) });
});

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'version-manual', 10, 60, user.id);
  const { id } = await params;
  await createManualVersion(id, user.id);
  return json({ ok: true }, { status: 201 });
});
