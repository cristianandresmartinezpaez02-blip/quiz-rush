// PUT /api/quizzes/:id/rating { stars: 1-5 } → calificar (requiere cuenta)
import { ratingSchema } from '@quiz-rush/shared';
import { enforceRateLimit, json, readJson, requireAccount, route } from '@/lib/api';
import { rateQuiz } from '@/lib/community-service';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireAccount(req);
  await enforceRateLimit(req, 'rating', 30, 60, user.id);
  const { id } = await params;
  const { stars } = await readJson(req, ratingSchema);
  return json(await rateQuiz(user.id, id, stars));
});
