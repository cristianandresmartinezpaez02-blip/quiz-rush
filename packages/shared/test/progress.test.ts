// Pruebas de la lógica de progreso (Fase 5): niveles, recompensas, logros, misiones,
// ligas, temporada, avatar, tienda, repaso espaciado y aventura.
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  ADVENTURE_WORLDS,
  avatarConfigSchema,
  buildSolution,
  computeGameRewards,
  dailyStreakBonus,
  dayKey,
  DEFAULT_AVATAR,
  EMPTY_STATS,
  isLevelUnlocked,
  leagueOutcome,
  levelFromXp,
  levelProgress,
  lockedParts,
  MAX_XP_PER_GAME,
  missionIncrement,
  MISSIONS,
  newlyUnlocked,
  nextTier,
  normalizeAvatar,
  pickMissions,
  previousDayKey,
  previousWeekKey,
  rankForLevel,
  reviewQuality,
  seasonRewards,
  seasonTier,
  SHOP_ITEMS,
  sm2,
  starsFor,
  totalXpForLevel,
  weekKey,
  type GameQuestion,
} from '../src';

describe('niveles y rangos', () => {
  it('la curva es creciente y coherente', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(100);
    expect(totalXpForLevel(3)).toBe(225);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(224)).toBe(2);
    for (let l = 1; l < 60; l++) expect(levelFromXp(totalXpForLevel(l))).toBe(l);
  });

  it('progreso dentro del nivel', () => {
    expect(levelProgress(150)).toMatchObject({ level: 2, current: 50, needed: 125 });
  });

  it('rangos por nivel', () => {
    expect(rankForLevel(1)).toBe('BRONZE');
    expect(rankForLevel(10)).toBe('SILVER');
    expect(rankForLevel(34)).toBe('GOLD');
    expect(rankForLevel(35)).toBe('DIAMOND');
    expect(rankForLevel(80)).toBe('LEGEND');
  });
});

describe('recompensas', () => {
  it('partida en vivo ganada con racha', () => {
    const r = computeGameRewards({
      mode: 'LIVE',
      correct: 5,
      answered: 5,
      scoredQuestions: 5,
      bestStreak: 5,
      rank: 1,
      players: 10,
    });
    // 10 participación + 25 aciertos + 25 perfecta + 30 podio + 10 racha
    expect(r.xp).toBe(100);
    expect(r.coins).toBe(25);
    expect(r.lines.map((l) => l.key)).toEqual([
      'participation',
      'correct',
      'perfect',
      'podium',
      'streak',
    ]);
  });

  it('practicar da la mitad y nunca se supera el tope', () => {
    const base = { correct: 4, answered: 5, scoredQuestions: 5, bestStreak: 0 };
    expect(computeGameRewards({ ...base, mode: 'PRACTICE' }).xp).toBe(15);
    expect(
      computeGameRewards({
        mode: 'RUSH',
        correct: 500,
        answered: 500,
        scoredQuestions: 500,
        bestStreak: 0,
      }).xp,
    ).toBe(MAX_XP_PER_GAME);
  });

  it('sin responder no hay XP; bono de racha diaria con tope', () => {
    expect(
      computeGameRewards({
        mode: 'LIVE',
        correct: 0,
        answered: 0,
        scoredQuestions: 5,
        bestStreak: 0,
      }).xp,
    ).toBe(0);
    expect(dailyStreakBonus(1)).toEqual({ xp: 5, coins: 2 });
    expect(dailyStreakBonus(30)).toEqual(dailyStreakBonus(7));
  });
});

describe('logros', () => {
  it('hay más de 30 y los códigos son únicos', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ACHIEVEMENTS.map((x) => x.code)).size).toBe(ACHIEVEMENTS.length);
  });

  it('se desbloquean solo los nuevos', () => {
    const stats = { ...EMPTY_STATS, games: 10, correct: 60 };
    const codes = newlyUnlocked(stats, new Set(['first_game'])).map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['games_10', 'correct_50']));
    expect(codes).not.toContain('first_game');
    expect(codes).not.toContain('games_50');
  });
});

describe('misiones', () => {
  it('3 por periodo, deterministas por jugador y día', () => {
    const a = pickMissions('u1', 'DAILY', '2026-11-16');
    expect(a).toHaveLength(3);
    expect(pickMissions('u1', 'DAILY', '2026-11-16')).toEqual(a);
    expect(a.every((x) => x.period === 'DAILY')).toBe(true);
    // Otro día u otro jugador: normalmente otras misiones
    const others = ['2026-11-17', '2026-11-18', '2026-11-19'].map((d) =>
      pickMissions('u1', 'DAILY', d),
    );
    expect(others.some((o) => o.map((x) => x.code).join() !== a.map((x) => x.code).join())).toBe(
      true,
    );
  });

  it('avance según el evento', () => {
    const game = {
      kind: 'game' as const,
      mode: 'RUSH' as const,
      correct: 7,
      bestStreak: 4,
      won: false,
      perfect: false,
      xp: 40,
      reviews: 0,
    };
    const byCode = (c: string) => MISSIONS.find((x) => x.code === c)!;
    expect(missionIncrement(byCode('d_correct_15'), game)).toBe(7);
    expect(missionIncrement(byCode('d_rush'), game)).toBe(1);
    expect(missionIncrement(byCode('d_duel'), game)).toBe(0);
    expect(missionIncrement(byCode('d_streak_3'), game)).toBe(3);
    expect(missionIncrement(byCode('w_streak_8'), game)).toBe(0);
    expect(missionIncrement(byCode('w_create'), { kind: 'quizPublished' })).toBe(1);
  });
});

describe('fechas por zona horaria', () => {
  it('día y semana locales (Bogotá, UTC−5)', () => {
    // 2026-11-16 03:00 UTC = 15 de noviembre a las 22:00 en Bogotá
    const d = new Date('2026-11-16T03:00:00Z');
    expect(dayKey(d)).toBe('2026-11-15');
    expect(weekKey(d)).toBe('2026-W46');
    expect(weekKey(new Date('2026-11-16T15:00:00Z'))).toBe('2026-W47');
    expect(previousDayKey('2026-03-01')).toBe('2026-02-28');
    expect(previousWeekKey('2026-W47')).toBe('2026-W46');
    expect(previousWeekKey('2026-W01')).toBe('2025-W52');
  });
});

describe('ligas y temporada', () => {
  it('suben los 5 primeros con XP, bajan los últimos', () => {
    expect(leagueOutcome('SILVER', 1, 30, 500)).toBe('PROMOTED');
    expect(leagueOutcome('SILVER', 3, 30, 0)).toBe('STAYED');
    expect(leagueOutcome('SILVER', 30, 30, 10)).toBe('RELEGATED');
    expect(leagueOutcome('BRONZE', 30, 30, 0)).toBe('STAYED');
    expect(leagueOutcome('LEGEND', 1, 30, 999)).toBe('STAYED');
    // Grupo de 4: solo pueden bajar 2
    expect(leagueOutcome('GOLD', 2, 4, 0)).toBe('STAYED');
    expect(nextTier('GOLD', 'PROMOTED')).toBe('DIAMOND');
    expect(nextTier('BRONZE', 'RELEGATED')).toBe('BRONZE');
  });

  it('pase de temporada con artículos exclusivos', () => {
    const rewards = seasonRewards();
    expect(rewards).toHaveLength(30);
    const itemCodes = rewards.flatMap((r) => (r.kind === 'item' ? [r.code] : []));
    for (const code of itemCodes) expect(SHOP_ITEMS.some((i) => i.code === code)).toBe(true);
    expect(seasonTier(0)).toBe(0);
    expect(seasonTier(650)).toBe(2);
    expect(seasonTier(1e9)).toBe(30);
  });
});

describe('avatar y tienda', () => {
  it('avatares antiguos se leen como válidos', () => {
    expect(
      normalizeAvatar({ base: 'blob', color: '#a3e635', eyes: 'happy', accessory: null }),
    ).toEqual({
      ...DEFAULT_AVATAR,
      color: '#a3e635',
    });
    expect(normalizeAvatar({ body: 'nope', hat: 'crown' })).toMatchObject({
      body: 'blob',
      hat: 'crown',
    });
  });

  it('las piezas de pago exigen tenerlas', () => {
    const config = avatarConfigSchema.parse({ body: 'robot', hat: 'cap' });
    expect(lockedParts(config, new Set(['hat:cap']))).toEqual(['body:robot']);
    expect(lockedParts(DEFAULT_AVATAR, new Set())).toEqual([]);
  });

  it('cada pieza de pago tiene artículo en la tienda', () => {
    expect(new Set(SHOP_ITEMS.map((i) => i.code)).size).toBe(SHOP_ITEMS.length);
    expect(SHOP_ITEMS.filter((i) => !i.seasonOnly).every((i) => i.price > 0)).toBe(true);
  });
});

describe('repaso espaciado (SM-2)', () => {
  it('los aciertos espacian el repaso; un fallo lo reinicia', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    let s = { easiness: 2.5, intervalDay: 0, repetitions: 0, lapses: 0 };
    const r1 = sm2(s, 5, now);
    expect(r1.intervalDay).toBe(1);
    s = r1;
    const r2 = sm2(s, 4, now);
    expect(r2.intervalDay).toBe(6);
    s = r2;
    const r3 = sm2(s, 4, now);
    expect(r3.intervalDay).toBeGreaterThan(6);
    const fail = sm2(r3, 0, now);
    expect(fail).toMatchObject({ intervalDay: 1, repetitions: 0, lapses: 1 });
    expect(fail.easiness).toBeGreaterThanOrEqual(1.3);
    expect(fail.dueAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('calidad según acierto y rapidez', () => {
    expect(reviewQuality(1, 1000, 10_000)).toBe(5);
    expect(reviewQuality(1, 9000, 10_000)).toBe(3);
    expect(reviewQuality(0.5, 1000, 10_000)).toBe(2);
    expect(reviewQuality(0, 1000, 10_000)).toBe(0);
  });
});

describe('aventura', () => {
  it('estrellas y desbloqueo de niveles y mundos', () => {
    expect(starsFor(5, 5)).toBe(3);
    expect(starsFor(4, 5)).toBe(2);
    expect(starsFor(3, 5)).toBe(1);
    expect(starsFor(2, 5)).toBe(0);
    expect(isLevelUnlocked('nature-1', {})).toBe(true);
    expect(isLevelUnlocked('nature-2', {})).toBe(false);
    expect(isLevelUnlocked('nature-2', { 'nature-1': 1 })).toBe(true);
    expect(isLevelUnlocked('time-1', { 'nature-5': 3 })).toBe(false);
    expect(isLevelUnlocked('time-1', { 'nature-6': 1 })).toBe(true);
    expect(isLevelUnlocked('nature-99', {})).toBe(false);
    expect(ADVENTURE_WORLDS).toHaveLength(4);
  });
});

describe('solución tras responder en solitario', () => {
  it('según el tipo, sin datos de más', () => {
    const q = (extra: Partial<GameQuestion>): GameQuestion => ({
      id: 'q',
      type: 'MULTIPLE_CHOICE',
      prompt: 'P',
      timeLimit: 20,
      points: 'NORMAL',
      media: null,
      hint: null,
      explanation: null,
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
      config: {},
      ...extra,
    });
    expect(buildSolution(q({}))).toEqual({ kind: 'options', optionIds: ['a'] });
    expect(buildSolution(q({ type: 'ORDER' }))).toEqual({ kind: 'order', ids: ['a', 'b'] });
    expect(
      buildSolution(q({ type: 'FILL_BLANK', options: [], config: { blanks: [['', 'Lima']] } })),
    ).toEqual({ kind: 'blanks', answers: ['Lima'] });
  });
});
