// GET /api/daily → quiz del día, si ya lo jugaste y el ranking del día
import { db } from '@quiz-rush/db';
import { json, optionalUser, route } from '@/lib/api';
import { dailyQuiz } from '@/lib/solo-content';
import { soloLeaderboard } from '@/lib/solo-service';

export const GET = route(async (req) => {
  const user = await optionalUser(req);
  const { day, quiz } = await dailyQuiz();
  const soloKey = `daily:${day}`;
  const mine = user
    ? await db.player.findFirst({
        where: { userId: user.id, game: { soloKey, status: 'FINISHED' } },
        select: { score: true, correctCount: true },
      })
    : null;
  return json({ day, quiz, played: mine, leaderboard: await soloLeaderboard(soloKey) });
});
