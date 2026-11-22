// GET /api/challenges/:id → desafío, ranking y tu intento
import { db } from '@quiz-rush/db';
import { json, optionalUser, route } from '@/lib/api';
import { challengeInfo } from '@/lib/solo-content';
import { soloLeaderboard } from '@/lib/solo-service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await optionalUser(req);
  const ch = await challengeInfo((await params).id);
  const soloKey = `challenge:${ch.id}`;
  const mine = user
    ? await db.player.findFirst({
        where: { userId: user.id, game: { soloKey, status: 'FINISHED' } },
        select: { score: true, correctCount: true },
      })
    : null;
  return json({
    id: ch.id,
    quiz: ch.quiz,
    by: ch.host?.profile ?? null,
    endsAt: ch.endsAt,
    questionCount: (ch.quizSnapshot as { questions?: unknown[] }).questions?.length ?? 0,
    played: mine,
    leaderboard: await soloLeaderboard(soloKey, 50),
  });
});
