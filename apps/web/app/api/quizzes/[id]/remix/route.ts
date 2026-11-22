// POST /api/quizzes/:id/remix → copia editable del quiz, con crédito al original
import { enforceRateLimit, json, requireUser, route } from '@/lib/api';
import { remixQuiz } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  await enforceRateLimit(req, 'remix', 10, 60, user.id);
  const { id } = await params;
  return json({ id: await remixQuiz(user.id, id) }, { status: 201 });
});
