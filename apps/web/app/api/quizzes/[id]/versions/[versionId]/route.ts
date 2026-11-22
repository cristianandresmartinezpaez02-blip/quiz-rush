// GET  /api/quizzes/:id/versions/:versionId → contenido de una versión (vista previa)
// POST /api/quizzes/:id/versions/:versionId → restaura esa versión
import { enforceRateLimit, json, requireUser, route } from '@/lib/api';
import { getQuizForEditor, getVersion, restoreVersion } from '@/lib/quiz-service';

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id, versionId } = await params;
  return json(await getVersion(id, versionId, user.id));
});

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'version-restore', 10, 60, user.id);
  const { id, versionId } = await params;
  await restoreVersion(id, versionId, user.id);
  return json(await getQuizForEditor(id, user.id));
});
