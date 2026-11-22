// Motor de progreso: XP, niveles, rangos, monedas, racha diaria, misiones, logros, liga semanal
// y pase de temporada. Lo usan la app web (partidas en solitario, misiones, tienda) y el servidor
// de tiempo real (partidas en vivo y duelos).
//
// Garantías:
//  • Cada recompensa se paga UNA vez: RewardLog tiene una clave única (usuario, origen, referencia).
//  • El perfil se bloquea (SELECT … FOR UPDATE) durante la transacción: dos partidas que terminan
//    a la vez no se pisan la XP ni las monedas.
//  • Cada cambio de monedas queda en el libro contable (CoinTransaction).
import {
  computeGameRewards,
  dailyStreakBonus,
  dayKey,
  DEFAULT_TIMEZONE,
  isPerfect,
  levelFromXp,
  localHour,
  missionIncrement,
  newlyUnlocked,
  nextTier,
  pickMissions,
  previousDayKey,
  rankForLevel,
  weekKey,
  type GamePerformance,
  type LeagueTier,
  type ProgressEvent,
  type ProgressOutcome,
  type UserStats,
} from '@quiz-rush/shared';
import type { Prisma } from '../generated/prisma/client';
import { db } from '../index';
import { ensureCatalogs } from './catalogs';

type Tx = Prisma.TransactionClient;

export const PROGRESS_TZ = process.env.PROGRESS_TIMEZONE || DEFAULT_TIMEZONE;

/** Contadores guardados en Profile.stats. */
export interface StoredStats {
  wins: number;
  perfect: number;
  bestStreak: number;
  duelWins: number;
  rushBest: number;
  adventureStars: number;
  reviews: number;
  modes: string[];
  dailyPlayed: number;
  nightGames: number;
}

export function readStoredStats(raw: unknown): StoredStats {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<StoredStats>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    wins: n(s.wins),
    perfect: n(s.perfect),
    bestStreak: n(s.bestStreak),
    duelWins: n(s.duelWins),
    rushBest: n(s.rushBest),
    adventureStars: n(s.adventureStars),
    reviews: n(s.reviews),
    modes: Array.isArray(s.modes) ? s.modes.filter((m): m is string => typeof m === 'string') : [],
    dailyPlayed: n(s.dailyPlayed),
    nightGames: n(s.nightGames),
  };
}

interface LockedProfile {
  xp: number;
  level: number;
  rank: string;
  coins: number;
  dailyStreak: number;
  bestDailyStreak: number;
  lastDailyAt: Date | null;
  stats: unknown;
  gamesPlayed: number;
  totalCorrect: number;
  quizzesCount: number;
  followersCount: number;
}

async function lockProfile(tx: Tx, userId: string): Promise<LockedProfile | null> {
  const rows = await tx.$queryRaw<LockedProfile[]>`
    SELECT "xp", "level", "rank"::text AS "rank", "coins", "dailyStreak", "bestDailyStreak",
           "lastDailyAt", "stats", "gamesPlayed", "totalCorrect", "quizzesCount", "followersCount"
    FROM "Profile" WHERE "userId" = ${userId} FOR UPDATE`;
  return rows[0] ?? null;
}

export function toUserStats(
  p: Omit<LockedProfile, 'stats'>,
  s: StoredStats,
  level: number,
): UserStats {
  return {
    games: p.gamesPlayed,
    correct: p.totalCorrect,
    bestStreak: s.bestStreak,
    wins: s.wins,
    perfect: s.perfect,
    dailyStreak: p.dailyStreak,
    level,
    quizzes: p.quizzesCount,
    followers: p.followersCount,
    duelWins: s.duelWins,
    rushBest: s.rushBest,
    adventureStars: s.adventureStars,
    reviews: s.reviews,
    modes: s.modes.length,
    dailyPlayed: s.dailyPlayed,
    nightGames: s.nightGames,
  };
}

/** Intenta reservar la recompensa. false = ya se había pagado. */
async function reserve(tx: Tx, userId: string, source: string, refId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "RewardLog" ("id", "userId", "source", "refId")
    VALUES (${`rw_${crypto.randomUUID().replace(/-/g, '')}`}, ${userId}, ${source}, ${refId})
    ON CONFLICT ("userId", "source", "refId") DO NOTHING
    RETURNING "id"`;
  return rows.length > 0;
}

interface ApplyInput {
  source: string;
  refId: string;
  xp: number;
  coins: number;
  /** Motivo en el libro de monedas */
  reason: string;
  at: Date;
  /** Partida: cuenta para la racha diaria, las misiones y las estadísticas */
  event?: ProgressEvent;
  /** Cambios en los contadores del perfil */
  patch?: (s: StoredStats) => void;
  /** Incrementos de las columnas de estadísticas (si no los aplicó ya otro proceso) */
  counts?: { games: number; correct: number; answered: number };
}

/** Aplica una recompensa dentro de la transacción (con el perfil ya bloqueado). */
async function apply(tx: Tx, userId: string, profile: LockedProfile, input: ApplyInput) {
  const stored = readStoredStats(profile.stats);
  input.patch?.(stored);

  let xp = input.xp;
  let coins = input.coins;
  const ledger: { amount: number; reason: string; refId: string }[] = [];
  if (input.coins) ledger.push({ amount: input.coins, reason: input.reason, refId: input.refId });

  // Racha diaria: la primera partida del día suma un día (o reinicia si se saltó alguno)
  let dailyStreak = profile.dailyStreak;
  let lastDailyAt = profile.lastDailyAt;
  let dailyBonus: ProgressOutcome['dailyBonus'] = null;
  if (input.event?.kind === 'game') {
    const today = dayKey(input.at, PROGRESS_TZ);
    const last = profile.lastDailyAt ? profile.lastDailyAt.toISOString().slice(0, 10) : null;
    if (last !== today) {
      dailyStreak = last === previousDayKey(today) ? profile.dailyStreak + 1 : 1;
      lastDailyAt = new Date(`${today}T00:00:00Z`);
      dailyBonus = dailyStreakBonus(dailyStreak);
      xp += dailyBonus.xp;
      coins += dailyBonus.coins;
      ledger.push({ amount: dailyBonus.coins, reason: 'DAILY_STREAK', refId: today });
    }
  }

  // Misiones del día y de la semana
  const missionsCompleted: string[] = [];
  if (input.event) {
    const periods = [
      { period: 'DAILY' as const, key: dayKey(input.at, PROGRESS_TZ) },
      { period: 'WEEKLY' as const, key: weekKey(input.at, PROGRESS_TZ) },
    ];
    const eventWithXp: ProgressEvent =
      input.event.kind === 'game'
        ? { ...input.event, xp: input.event.xp + (dailyBonus?.xp ?? 0) }
        : input.event;
    for (const { period, key } of periods) {
      for (const def of pickMissions(userId, period, key)) {
        const inc = missionIncrement(def, eventWithXp);
        if (inc <= 0) continue;
        const mission = await tx.mission.findUnique({
          where: { code: def.code },
          select: { id: true },
        });
        if (!mission) continue;
        const current = await tx.userMission.upsert({
          where: { userId_missionId_periodKey: { userId, missionId: mission.id, periodKey: key } },
          create: { userId, missionId: mission.id, periodKey: key },
          update: {},
        });
        if (current.completedAt) continue;
        const progress = Math.min(def.goalTarget, current.progress + inc);
        await tx.userMission.update({
          where: { id: current.id },
          data: { progress, ...(progress >= def.goalTarget && { completedAt: input.at }) },
        });
        if (progress >= def.goalTarget) missionsCompleted.push(def.code);
      }
    }
  }

  // Columnas de estadísticas
  const gamesPlayed = profile.gamesPlayed + (input.counts?.games ?? 0);
  const totalCorrect = profile.totalCorrect + (input.counts?.correct ?? 0);

  // XP → nivel → logros (los logros también dan XP: se repite hasta que no haya nuevos)
  const achievements: string[] = [];
  const owned = new Set(
    (
      await tx.userAchievement.findMany({
        where: { userId },
        select: { achievement: { select: { code: true } } },
      })
    ).map((x) => x.achievement.code),
  );
  let totalXp = profile.xp + xp;
  for (let round = 0; round < 3; round++) {
    const level = levelFromXp(totalXp);
    const stats = toUserStats(
      { ...profile, gamesPlayed, totalCorrect, dailyStreak },
      stored,
      level,
    );
    const fresh = newlyUnlocked(stats, owned);
    if (!fresh.length) break;
    for (const def of fresh) {
      owned.add(def.code);
      achievements.push(def.code);
      const row = await tx.achievement.findUnique({
        where: { code: def.code },
        select: { id: true },
      });
      if (!row) continue;
      await tx.userAchievement.create({ data: { userId, achievementId: row.id } });
      xp += def.rewardXp;
      totalXp += def.rewardXp;
      if (def.rewardCoins) {
        coins += def.rewardCoins;
        ledger.push({ amount: def.rewardCoins, reason: 'ACHIEVEMENT', refId: def.code });
      }
    }
  }

  const levelAfter = levelFromXp(totalXp);
  const rankAfter = rankForLevel(levelAfter);
  await tx.profile.update({
    where: { userId },
    data: {
      xp: totalXp,
      level: levelAfter,
      rank: rankAfter,
      coins: profile.coins + coins,
      dailyStreak,
      bestDailyStreak: Math.max(profile.bestDailyStreak, dailyStreak),
      lastDailyAt,
      stats: stored as unknown as Prisma.InputJsonValue,
      ...(input.counts && {
        gamesPlayed,
        totalCorrect,
        totalAnswered: { increment: input.counts.answered },
      }),
    },
  });
  if (ledger.length) {
    await tx.coinTransaction.createMany({
      data: ledger.filter((l) => l.amount).map((l) => ({ userId, ...l })),
    });
  }
  await tx.rewardLog.update({
    where: { userId_source_refId: { userId, source: input.source, refId: input.refId } },
    data: { xp, coins },
  });

  if (xp > 0) {
    await addLeagueXp(tx, userId, xp, input.at);
    await addSeasonPoints(tx, userId, xp, input.at);
    // Clubes (Fase 7): cada club suma el XP que ganan sus miembros
    await tx.clubMember.updateMany({ where: { userId }, data: { points: { increment: xp } } });
  }

  // Avisos: subida de nivel y logros
  const notes: Prisma.NotificationCreateManyInput[] = [];
  if (levelAfter > profile.level) {
    notes.push({ userId, type: 'LEVEL_UP', data: { level: levelAfter, rank: rankAfter } });
  }
  for (const code of achievements) notes.push({ userId, type: 'ACHIEVEMENT', data: { code } });
  if (notes.length) await tx.notification.createMany({ data: notes });

  const outcome: ProgressOutcome = {
    xp,
    coins,
    levelBefore: profile.level,
    levelAfter,
    rankBefore: profile.rank,
    rankAfter,
    dailyStreak,
    dailyBonus,
    achievements,
    missionsCompleted,
  };
  return outcome;
}

// ───────────────────────── Liga y temporada ─────────────────────────

async function addLeagueXp(tx: Tx, userId: string, xp: number, at: Date) {
  const wk = weekKey(at, PROGRESS_TZ);
  let membership = await tx.leagueMembership.findFirst({
    where: { userId, league: { weekKey: wk } },
    select: { leagueId: true },
  });
  if (!membership) {
    // División: la de la semana pasada, con su ascenso o descenso aplicado
    const last = await tx.leagueMembership.findFirst({
      where: { userId, league: { weekKey: { lt: wk } } },
      orderBy: { league: { weekKey: 'desc' } },
      select: { result: true, league: { select: { tier: true } } },
    });
    const tier: LeagueTier = last ? nextTier(last.league.tier, last.result ?? 'STAYED') : 'BRONZE';
    const open = await tx.$queryRaw<{ id: string }[]>`
      SELECT l."id" FROM "League" l
      LEFT JOIN "LeagueMembership" m ON m."leagueId" = l."id"
      WHERE l."tier" = ${tier}::"Rank" AND l."weekKey" = ${wk}
      GROUP BY l."id", l."groupNo"
      HAVING count(m."userId") < 30
      ORDER BY l."groupNo" LIMIT 1`;
    let leagueId = open[0]?.id;
    if (!leagueId) {
      const max = await tx.league.aggregate({
        where: { tier, weekKey: wk },
        _max: { groupNo: true },
      });
      const created = await tx.league.upsert({
        where: {
          tier_weekKey_groupNo: { tier, weekKey: wk, groupNo: (max._max.groupNo ?? 0) + 1 },
        },
        create: { tier, weekKey: wk, groupNo: (max._max.groupNo ?? 0) + 1 },
        update: {},
        select: { id: true },
      });
      leagueId = created.id;
    }
    await tx.leagueMembership.create({ data: { leagueId, userId } });
    membership = { leagueId };
  }
  await tx.leagueMembership.update({
    where: { leagueId_userId: { leagueId: membership.leagueId, userId } },
    data: { weeklyXp: { increment: xp } },
  });
}

async function addSeasonPoints(tx: Tx, userId: string, xp: number, at: Date) {
  const season = await tx.season.findFirst({
    where: { startsAt: { lte: at }, endsAt: { gt: at } },
    select: { id: true },
  });
  if (!season) return;
  await tx.seasonProgress.upsert({
    where: { seasonId_userId: { seasonId: season.id, userId } },
    create: { seasonId: season.id, userId, points: xp },
    update: { points: { increment: xp } },
  });
}

// ───────────────────────── API pública ─────────────────────────

export interface PlayRecord extends GamePerformance {
  userId: string;
  /** Identificador único de la partida (para no pagar dos veces) */
  refId: string;
  /** Las columnas gamesPlayed/totalCorrect/totalAnswered ya las actualizó otro proceso */
  countsUpdated?: boolean;
  /** Rush: aciertos de esta partida (para el récord) */
  rushScore?: number;
  /** Aventura: total de estrellas del jugador tras esta partida */
  adventureStars?: number;
  /** Repaso: preguntas repasadas */
  reviews?: number;
  at?: Date;
}

/**
 * Registra una partida terminada y entrega su recompensa.
 * Devuelve null si esa partida ya se había pagado o el usuario no tiene perfil.
 */
export async function recordPlay(rec: PlayRecord): Promise<ProgressOutcome | null> {
  const at = rec.at ?? new Date();
  const rewards = computeGameRewards(rec);
  const perfect = isPerfect(rec);
  const won = !!rec.won || (rec.rank === 1 && (rec.players ?? 0) >= 2);
  await ensureCatalogs();
  return db.$transaction(
    async (tx) => {
      if (!(await reserve(tx, rec.userId, 'GAME', rec.refId))) return null;
      const profile = await lockProfile(tx, rec.userId);
      if (!profile) return null;
      return apply(tx, rec.userId, profile, {
        source: 'GAME',
        refId: rec.refId,
        xp: rewards.xp,
        coins: rewards.coins,
        reason: `GAME_${rec.mode}`,
        at,
        event: {
          kind: 'game',
          mode: rec.mode,
          correct: rec.correct,
          bestStreak: rec.bestStreak,
          won,
          perfect,
          xp: rewards.xp,
          reviews: rec.reviews ?? 0,
        },
        counts: rec.countsUpdated
          ? undefined
          : { games: 1, correct: rec.correct, answered: rec.answered },
        patch: (s) => {
          if (won) s.wins += 1;
          if (perfect) s.perfect += 1;
          if (rec.mode === 'DUEL' && rec.won) s.duelWins += 1;
          s.bestStreak = Math.max(s.bestStreak, rec.bestStreak);
          if (rec.rushScore !== undefined) s.rushBest = Math.max(s.rushBest, rec.rushScore);
          if (rec.adventureStars !== undefined) s.adventureStars = rec.adventureStars;
          s.reviews += rec.reviews ?? 0;
          if (!s.modes.includes(rec.mode)) s.modes.push(rec.mode);
          if (rec.mode === 'DAILY') s.dailyPlayed += 1;
          if (localHour(at, PROGRESS_TZ) < 5) s.nightGames += 1;
        },
      });
    },
    { timeout: 20_000 },
  );
}

/** Entrega XP/monedas sueltas (misiones, pase de temporada, liga). Idempotente por origen+referencia. */
export async function grant(
  userId: string,
  source: string,
  refId: string,
  xp: number,
  coins: number,
): Promise<ProgressOutcome | null> {
  await ensureCatalogs();
  return db.$transaction(
    async (tx) => {
      if (!(await reserve(tx, userId, source, refId))) return null;
      const profile = await lockProfile(tx, userId);
      if (!profile) return null;
      return apply(tx, userId, profile, {
        source,
        refId,
        xp,
        coins,
        reason: source,
        at: new Date(),
      });
    },
    { timeout: 20_000 },
  );
}

/** Al publicar un quiz: misión de crear y logros de creador (una vez por quiz). */
export async function recordQuizPublished(userId: string, quizId: string) {
  await ensureCatalogs();
  return db.$transaction(
    async (tx) => {
      if (!(await reserve(tx, userId, 'PUBLISH', quizId))) return null;
      const profile = await lockProfile(tx, userId);
      if (!profile) return null;
      return apply(tx, userId, profile, {
        source: 'PUBLISH',
        refId: quizId,
        xp: 0,
        coins: 0,
        reason: 'PUBLISH',
        at: new Date(),
        event: { kind: 'quizPublished' },
      });
    },
    { timeout: 20_000 },
  );
}

/** Reclama la recompensa de una misión completada. */
export async function claimMission(userId: string, userMissionId: string) {
  const um = await db.userMission.findFirst({
    where: { id: userMissionId, userId },
    include: { mission: true },
  });
  if (!um) return { error: 'NOT_FOUND' as const };
  if (!um.completedAt) return { error: 'NOT_COMPLETED' as const };
  const outcome = await grant(
    userId,
    'MISSION',
    um.id,
    um.mission.rewardXp,
    um.mission.rewardCoins,
  );
  if (!outcome) return { error: 'ALREADY_CLAIMED' as const };
  await db.userMission.update({ where: { id: um.id }, data: { claimedAt: new Date() } });
  return { outcome };
}
