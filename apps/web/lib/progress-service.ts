// Lectura del progreso del jugador: panel de progreso, tienda y avatar.
import 'server-only';
import { db } from '@quiz-rush/db';
import {
  activeSeason,
  closeLeagueWeek,
  ensureCatalogs,
  ownedItemCodes,
  readStoredStats,
  toUserStats,
} from '@quiz-rush/db/progress';
import {
  achievementProgress,
  ACHIEVEMENTS,
  dayKey,
  levelProgress,
  LEAGUE_DEMOTE,
  LEAGUE_PROMOTE,
  normalizeAvatar,
  pickMissions,
  previousWeekKey,
  SEASON_TIER_POINTS,
  SEASON_TIERS,
  seasonTier,
  SHOP_ITEMS,
  weekKey,
  type SeasonReward,
} from '@quiz-rush/shared';
import { ApiError } from './api';
import { runAtMostEvery } from './cache';
import { reviewDueCount } from './solo-content';

const TZ = process.env.PROGRESS_TIMEZONE || 'America/Bogota';

/** Cierre de la semana anterior (idempotente). Lo llama el worker cada hora. */
export function runLeagueClose() {
  return closeLeagueWeek(previousWeekKey(weekKey(new Date(), TZ)));
}

/**
 * Además, al abrir el panel de progreso se asegura el cierre (como mucho cada 10 min): así el
 * lunes a primera hora nadie ve la liga de la semana pasada aunque el worker aún no haya pasado.
 */
async function closePreviousLeagueWeek() {
  await runAtMostEvery('league-close', 600, () =>
    closeLeagueWeek(previousWeekKey(weekKey(new Date(), TZ))),
  ).catch((err) => console.error('[ligas] no se pudo cerrar la semana:', err));
}

export async function getProgress(userId: string) {
  await ensureCatalogs();
  await closePreviousLeagueWeek();
  const now = new Date();
  const today = dayKey(now, TZ);
  const week = weekKey(now, TZ);

  const profile = await db.profile.findUnique({ where: { userId } });
  if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND');
  const stored = readStoredStats(profile.stats);
  const stats = toUserStats(profile, stored, profile.level);

  // Misiones del día y de la semana (las que le tocan + su avance)
  const picks = [
    ...pickMissions(userId, 'DAILY', today).map((m) => ({ ...m, periodKey: today })),
    ...pickMissions(userId, 'WEEKLY', week).map((m) => ({ ...m, periodKey: week })),
  ];
  const missionRows = await db.userMission.findMany({
    where: {
      userId,
      periodKey: { in: [today, week] },
      mission: { code: { in: picks.map((p) => p.code) } },
    },
    include: { mission: { select: { code: true } } },
  });
  const missions = picks.map((p) => {
    const row = missionRows.find((r) => r.mission.code === p.code && r.periodKey === p.periodKey);
    return {
      id: row?.id ?? null,
      code: p.code,
      period: p.period,
      goalType: p.goalType,
      target: p.goalTarget,
      progress: row?.progress ?? 0,
      completed: !!row?.completedAt,
      claimed: !!row?.claimedAt,
      rewardXp: p.rewardXp,
      rewardCoins: p.rewardCoins,
    };
  });

  // Logros (los secretos no se muestran hasta desbloquearlos)
  const unlocked = await db.userAchievement.findMany({
    where: { userId },
    select: { unlockedAt: true, achievement: { select: { code: true } } },
  });
  const unlockedAt = new Map(unlocked.map((u) => [u.achievement.code, u.unlockedAt]));
  const achievements = ACHIEVEMENTS.map((a) => ({
    code: a.code,
    icon: a.icon,
    category: a.category,
    secret: !!a.secret && !unlockedAt.has(a.code),
    threshold: a.threshold,
    progress: achievementProgress(a, stats),
    unlockedAt: unlockedAt.get(a.code)?.toISOString() ?? null,
    rewardXp: a.rewardXp,
    rewardCoins: a.rewardCoins,
  }));

  // Liga de la semana
  const membership = await db.leagueMembership.findFirst({
    where: { userId, league: { weekKey: week } },
    select: { leagueId: true, league: { select: { tier: true } } },
  });
  let league = null;
  if (membership) {
    const members = await db.leagueMembership.findMany({
      where: { leagueId: membership.leagueId },
      orderBy: [{ weeklyXp: 'desc' }, { userId: 'asc' }],
      select: {
        userId: true,
        weeklyXp: true,
        user: {
          select: { profile: { select: { username: true, displayName: true } }, avatar: true },
        },
      },
    });
    league = {
      tier: membership.league.tier,
      promote: LEAGUE_PROMOTE,
      demote: LEAGUE_DEMOTE,
      members: members.map((m, i) => ({
        position: i + 1,
        userId: m.userId,
        weeklyXp: m.weeklyXp,
        username: m.user.profile?.username ?? '',
        displayName: m.user.profile?.displayName ?? '',
        avatar: normalizeAvatar(m.user.avatar?.config),
        me: m.userId === userId,
      })),
    };
  }
  const lastLeague = await db.leagueMembership.findFirst({
    where: { userId, league: { weekKey: { lt: week } }, result: { not: null } },
    orderBy: { league: { weekKey: 'desc' } },
    select: {
      result: true,
      finalPosition: true,
      league: { select: { tier: true, weekKey: true } },
    },
  });

  // Pase de temporada
  const season = await activeSeason(now);
  let seasonView = null;
  if (season) {
    const sp = await db.seasonProgress.findUnique({
      where: { seasonId_userId: { seasonId: season.id, userId } },
    });
    const points = sp?.points ?? 0;
    seasonView = {
      number: season.number,
      endsAt: season.endsAt.toISOString(),
      points,
      tier: seasonTier(points),
      tiers: SEASON_TIERS,
      tierPoints: SEASON_TIER_POINTS,
      rewards: season.rewards as unknown as SeasonReward[],
      claimed: sp?.claimed ?? [],
    };
  }

  return {
    profile: {
      username: profile.username,
      displayName: profile.displayName,
      xp: profile.xp,
      ...levelProgress(profile.xp),
      rank: profile.rank,
      coins: profile.coins,
      dailyStreak: profile.dailyStreak,
      bestDailyStreak: profile.bestDailyStreak,
      playedToday: profile.lastDailyAt?.toISOString().slice(0, 10) === today,
    },
    stats,
    missions,
    achievements,
    league,
    lastLeague,
    season: seasonView,
    reviewDue: await reviewDueCount(userId),
  };
}

export type ProgressData = Awaited<ReturnType<typeof getProgress>>;

/** Resumen pequeño para la cabecera (nivel, monedas, racha). */
export async function getProgressChip(userId: string) {
  const p = await db.profile.findUnique({
    where: { userId },
    select: { xp: true, coins: true, dailyStreak: true, rank: true },
  });
  if (!p) return null;
  const { level, ratio } = levelProgress(p.xp);
  return { level, ratio, coins: p.coins, dailyStreak: p.dailyStreak, rank: p.rank };
}

/** Tienda: artículos a la venta, qué tiene el jugador y su avatar. */
export async function getShop(userId: string) {
  await ensureCatalogs();
  const [owned, profile, avatar, equipped] = await Promise.all([
    ownedItemCodes(userId),
    db.profile.findUnique({ where: { userId }, select: { coins: true } }),
    db.avatar.findUnique({ where: { userId }, select: { config: true } }),
    db.inventory.findFirst({
      where: { userId, equipped: true, item: { type: 'CELEBRATION' } },
      select: { item: { select: { code: true } } },
    }),
  ]);
  return {
    coins: profile?.coins ?? 0,
    avatar: normalizeAvatar(avatar?.config),
    celebration: equipped?.item.code ?? null,
    items: SHOP_ITEMS.map((i) => ({ ...i, owned: owned.has(i.code) })),
  };
}
