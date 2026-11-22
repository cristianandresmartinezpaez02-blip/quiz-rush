// GET /api/quizzes/:id/export?format=csv|xlsx → descargar un quiz propio como tabla
import { requireUser, route } from '@/lib/api';
import { downloadResponse, exportQuiz } from '@/lib/quiz-io';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const format = new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
  return downloadResponse(await exportQuiz(user.id, (await params).id, format));
});
