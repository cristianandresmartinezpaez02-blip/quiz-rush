// POST   /api/clubs/:id/quizzes { quizId } → añadir un quiz público al club
// DELETE /api/clubs/:id/quizzes { quizId } → quitarlo
import { z } from 'zod';
import { enforceRateLimit, json, readJson, requireAccount, route } from '@/lib/api';
import { addClubQuiz, removeClubQuiz } from '@/lib/club-service';

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ quizId: z.string().min(1).max(64) });

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'club-quiz', 30, 600, user.id);
  const { quizId } = await readJson(req, body);
  await addClubQuiz(user.id, (await params).id, quizId);
  return json({ ok: true }, { status: 201 });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  const { quizId } = await readJson(req, body);
  await removeClubQuiz(user.id, (await params).id, quizId);
  return json({ ok: true });
});
