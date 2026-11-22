// Integración del motor de progreso con PostgreSQL real (npm run infra:up).
// Cada prueba usa usuarios temporales que se borran al final.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dayKey, pickMissions, previousDayKey, weekKey } from '@quiz-rush/shared';
import { db } from '../src';
import {
  buyItem,
  claimMission,
  claimSeasonTier,
  closeLeagueWeek,
  grant,
  PROGRESS_TZ,
  recordPlay,
  recordReviewAnswers,
  saveAvatar,
} from '../src/progress';

const created: string[] = [];
const leagueWeeks: string[] = [];

async function tempUser(coins = 0) {
  const id = `test_${randomUUID().slice(0, 12)}`;
  await db.user.create({ data: { id, name: 'Prueba', email: `${id}@test.local` } });
  await db.profile.create({ data: { userId: id, username: id, displayName: 'Prueba', coins } });
  created.push(id);
  return id;
}

const live = (userId: string, extra: Partial<Parameters<typeof recordPlay>[0]> = {}) => ({
  userId,
  refId: `game_${randomUUID()}`,
  mode: 'LIVE' as const,
  correct: 5,
  answered: 5,
  scoredQuestions: 5,
  bestStreak: 5,
  rank: 1,
  players: 6,
  ...extra,
});

beforeAll(async () => {
  await db.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await db.league.deleteMany({ where: { weekKey: { in: leagueWeeks } } });
  // Ligas de esta semana que se quedaron vacías al borrar a los usuarios de prueba
  await db.leagueMembership.deleteMany({ where: { userId: { in: created } } });
  await db.league.deleteMany({ where: { members: { none: {} } } });
  await db.user.deleteMany({ where: { id: { in: created } } });
});

describe('recompensa por partida', () => {
  it('XP, nivel, monedas, racha, logros, liga y temporada en una sola transacción', async () => {
    const u = await tempUser();
    const out = await recordPlay(live(u));
    expect(out).not.toBeNull();
    // 100 de la partida + 5 de la racha diaria + logros (first_game 20, perfect_1 50, win_1 50, streak_5 40)
    expect(out!.achievements).toEqual(
      expect.arrayContaining(['first_game', 'perfect_1', 'win_1', 'streak_5']),
    );
    expect(out!.dailyStreak).toBe(1);
    expect(out!.levelAfter).toBeGreaterThan(out!.levelBefore);

    const p = await db.profile.findUniqueOrThrow({ where: { userId: u } });
    expect(p.xp).toBe(out!.xp);
    expect(p.coins).toBe(out!.coins);
    expect(p.gamesPlayed).toBe(1);
    expect(p.totalCorrect).toBe(5);
    // Cada moneda está en el libro contable
    const ledger = await db.coinTransaction.aggregate({
      where: { userId: u },
      _sum: { amount: true },
    });
    expect(ledger._sum.amount).toBe(p.coins);
    // Liga de la semana y pase de temporada
    const membership = await db.leagueMembership.findFirstOrThrow({
      where: { userId: u, league: { weekKey: weekKey(new Date(), PROGRESS_TZ) } },
      include: { league: true },
    });
    expect(membership.weeklyXp).toBe(out!.xp);
    expect(membership.league.tier).toBe('BRONZE');
    const season = await db.seasonProgress.findFirstOrThrow({ where: { userId: u } });
    expect(season.points).toBe(out!.xp);
    // Avisos de nivel y logros
    expect(await db.notification.count({ where: { userId: u, type: 'ACHIEVEMENT' } })).toBe(
      out!.achievements.length,
    );
  });

  it('la misma partida no se paga dos veces', async () => {
    const u = await tempUser();
    const rec = live(u);
    expect(await recordPlay(rec)).not.toBeNull();
    expect(await recordPlay(rec)).toBeNull();
    expect((await db.profile.findUniqueOrThrow({ where: { userId: u } })).gamesPlayed).toBe(1);
  });

  it('partidas simultáneas no se pisan la XP', async () => {
    const u = await tempUser();
    const recs = Array.from({ length: 6 }, () => live(u, { rank: 4, bestStreak: 0, correct: 2 }));
    const outs = await Promise.all(recs.map((r) => recordPlay(r)));
    const p = await db.profile.findUniqueOrThrow({ where: { userId: u } });
    expect(p.xp).toBe(outs.reduce((a, o) => a + o!.xp, 0));
    expect(p.gamesPlayed).toBe(6);
  });

  it('la racha diaria sube con días seguidos y se reinicia si se salta uno', async () => {
    const u = await tempUser();
    const today = dayKey(new Date(), PROGRESS_TZ);
    const at = (key: string) => new Date(`${key}T17:00:00Z`);
    const d1 = previousDayKey(previousDayKey(today));
    const d2 = previousDayKey(today);
    expect((await recordPlay(live(u, { at: at(d1) })))!.dailyStreak).toBe(1);
    expect((await recordPlay(live(u, { at: at(d2) })))!.dailyStreak).toBe(2);
    const sameDay = await recordPlay(live(u, { at: at(d2) }));
    expect(sameDay!.dailyBonus).toBeNull();
    expect((await recordPlay(live(u, { at: at(today) })))!.dailyStreak).toBe(3);
    const u2 = await tempUser();
    await recordPlay(live(u2, { at: at(d1) }));
    expect((await recordPlay(live(u2, { at: at(today) })))!.dailyStreak).toBe(1);
  });

  it('las misiones avanzan y se reclaman una sola vez', async () => {
    const u = await tempUser();
    // Juega varias partidas: alguna misión diaria de "jugar" o "aciertos" se completará
    for (let i = 0; i < 4; i++) await recordPlay(live(u, { correct: 5 }));
    const done = await db.userMission.findMany({
      where: { userId: u, completedAt: { not: null } },
    });
    const picked = pickMissions(u, 'DAILY', dayKey(new Date(), PROGRESS_TZ)).map((m) => m.code);
    expect(picked).toHaveLength(3);
    expect(done.length).toBeGreaterThan(0);
    const before = await db.profile.findUniqueOrThrow({ where: { userId: u } });
    const claim = await claimMission(u, done[0]!.id);
    expect('outcome' in claim).toBe(true);
    const after = await db.profile.findUniqueOrThrow({ where: { userId: u } });
    expect(after.xp).toBeGreaterThanOrEqual(before.xp);
    expect(await claimMission(u, done[0]!.id)).toEqual({ error: 'ALREADY_CLAIMED' });
  });
});

describe('tienda, avatar y temporada', () => {
  it('comprar con monedas; no se puede sin saldo ni dos veces', async () => {
    const u = await tempUser(100);
    await expect(buyItem(u, 'hat:crown')).rejects.toThrow('NOT_ENOUGH_COINS');
    await db.profile.update({ where: { userId: u }, data: { coins: 2000 } });
    expect(await buyItem(u, 'hat:crown')).toEqual({ coins: 800 });
    await expect(buyItem(u, 'hat:crown')).rejects.toThrow('ALREADY_OWNED');
    await expect(buyItem(u, 'hat:laurel')).rejects.toThrow('ITEM_NOT_FOR_SALE');
    const spent = await db.coinTransaction.findFirstOrThrow({
      where: { userId: u, reason: 'SHOP' },
    });
    expect(spent.amount).toBe(-1200);
  });

  it('el avatar solo usa piezas propias o gratuitas', async () => {
    const u = await tempUser(5000);
    await expect(saveAvatar(u, { body: 'robot' })).rejects.toThrow('ITEM_LOCKED');
    await buyItem(u, 'body:robot');
    expect(await saveAvatar(u, { body: 'robot', color: '#a3e635' })).toMatchObject({
      body: 'robot',
    });
  });

  it('pase de temporada: niveles alcanzados, una vez', async () => {
    const u = await tempUser();
    await expect(claimSeasonTier(u, 1)).rejects.toThrow('TIER_LOCKED');
    await grant(u, 'TEST', 'season-points', 700, 0); // 700 XP = nivel 2 del pase
    const r = await claimSeasonTier(u, 1);
    expect(r.reward.tier).toBe(1);
    await expect(claimSeasonTier(u, 1)).rejects.toThrow('ALREADY_CLAIMED');
    await expect(claimSeasonTier(u, 5)).rejects.toThrow('TIER_LOCKED');
  });
});

describe('ligas', () => {
  it('al cerrar la semana: posiciones, ascensos y premios', async () => {
    const wk = '2020-W10';
    leagueWeeks.push(wk);
    const league = await db.league.create({ data: { tier: 'SILVER', weekKey: wk, groupNo: 1 } });
    const users = await Promise.all(Array.from({ length: 12 }, () => tempUser()));
    await db.leagueMembership.createMany({
      data: users.map((userId, i) => ({ leagueId: league.id, userId, weeklyXp: 1000 - i * 50 })),
    });
    expect(await closeLeagueWeek(wk)).toBe(1);
    const rows = await db.leagueMembership.findMany({
      where: { leagueId: league.id },
      orderBy: { finalPosition: 'asc' },
    });
    expect(rows.map((r) => r.result)).toEqual([
      ...Array(5).fill('PROMOTED'),
      ...Array(2).fill('STAYED'),
      ...Array(5).fill('RELEGATED'),
    ]);
    expect((await db.profile.findUniqueOrThrow({ where: { userId: users[0]! } })).coins).toBe(100);
    // Idempotente
    expect(await closeLeagueWeek(wk)).toBe(0);
  });
});

describe('repaso espaciado', () => {
  it('las falladas entran y el repaso las reprograma', async () => {
    const u = await tempUser();
    const q = await db.question.findFirstOrThrow({ select: { id: true } });
    await recordReviewAnswers(
      u,
      [
        { questionId: q.id, quality: 0 },
        { questionId: 'no-existe', quality: 0 },
      ],
      {
        inReview: false,
      },
    );
    const item = await db.reviewItem.findUniqueOrThrow({
      where: { userId_questionId: { userId: u, questionId: q.id } },
    });
    expect(item.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
    await recordReviewAnswers(u, [{ questionId: q.id, quality: 5 }], { inReview: true });
    const after = await db.reviewItem.findUniqueOrThrow({
      where: { userId_questionId: { userId: u, questionId: q.id } },
    });
    expect(after.repetitions).toBe(1);
    expect(after.dueAt.getTime()).toBeGreaterThan(Date.now());
    // Fallarla otra vez jugando la adelanta a hoy y reinicia su progreso
    await recordReviewAnswers(u, [{ questionId: q.id, quality: 1 }], { inReview: false });
    const again = await db.reviewItem.findUniqueOrThrow({
      where: { userId_questionId: { userId: u, questionId: q.id } },
    });
    expect(again).toMatchObject({ repetitions: 0, lapses: 1 });
    expect(again.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
