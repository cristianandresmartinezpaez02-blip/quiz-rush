// GET /api/adventure → mundos y niveles con tus estrellas y lo desbloqueado
import { ADVENTURE_WORLDS, isLevelUnlocked, levelKey } from '@quiz-rush/shared';
import { json, requireUser, route } from '@/lib/api';
import { adventureStars } from '@/lib/solo-content';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const stars = await adventureStars(user.id);
  return json({
    totalStars: Object.values(stars).reduce((a, b) => a + b, 0),
    worlds: ADVENTURE_WORLDS.map((w) => ({
      ...w,
      levels: Array.from({ length: w.levels }, (_, i) => {
        const key = levelKey(w.id, i + 1);
        return { key, level: i + 1, stars: stars[key] ?? 0, unlocked: isLevelUnlocked(key, stars) };
      }),
    })),
  });
});
