// GET /api/rush → ranking del Rush de hoy y tu récord
import { db } from '@quiz-rush/db';
import { readStoredStats } from '@quiz-rush/db/progress';
import { dayKey } from '@quiz-rush/shared';
import { json, optionalUser, route } from '@/lib/api';
import { PROGRESS_TZ } from '@/lib/solo-content';
import { soloLeaderboard } from '@/lib/solo-service';

export const GET = route(async (req) => {
  const user = await optionalUser(req);
  const profile = user
    ? await db.profile.findUnique({ where: { userId: user.id }, select: { stats: true } })
    : null;
  return json({
    best: profile ? readStoredStats(profile.stats).rushBest : 0,
    leaderboard: await soloLeaderboard(`rush:${dayKey(new Date(), PROGRESS_TZ)}`),
  });
});
