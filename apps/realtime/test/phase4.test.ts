// Integración de la Fase 4: tipos de pregunta nuevos, modos de juego y power-ups.
// Servidor, Redis y PostgreSQL reales; solo se simula la verificación del JWT.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  GameQuestion,
  HostSnapshot,
  PlayerResult,
  PlayerSnapshot,
  PowerUpResult,
  RevealData,
} from '@quiz-rush/shared';
import type { Realtime } from '../src/server';
import {
  call,
  cleanupGame,
  client,
  createTestGame,
  next,
  startServer,
  type Client,
} from './helpers';

let hostUserId = '';
vi.mock('../src/auth', () => ({
  verifyToken: async (token?: string) =>
    token === 'host-token' ? { userId: hostUserId, name: 'Demo', isAnonymous: false } : null,
}));

type JoinRes = {
  playerId: string;
  reconnectToken: string;
  gameId: string;
  snapshot: PlayerSnapshot;
};
const base = {
  points: 'NORMAL' as const,
  timeLimit: 20,
  media: null,
  hint: null,
  explanation: null,
};
const mc = (id: string, extra: Partial<GameQuestion> = {}): GameQuestion => ({
  id,
  type: 'MULTIPLE_CHOICE',
  prompt: `Pregunta ${id}`,
  options: [
    { id: `${id}-ok`, text: 'Bien', isCorrect: true },
    { id: `${id}-x1`, text: 'Mal 1', isCorrect: false },
    { id: `${id}-x2`, text: 'Mal 2', isCorrect: false },
    { id: `${id}-x3`, text: 'Mal 3', isCorrect: false },
  ],
  config: {},
  ...base,
  ...extra,
});

/** Partida lista en la sala de espera con N jugadores conectados. */
async function setupGame(
  url: string,
  rt: Realtime,
  questions: GameQuestion[],
  nicks: string[],
  settings: Record<string, unknown> = {},
) {
  const game = await createTestGame(questions);
  hostUserId = game.hostId;
  const host = await client(url);
  const snap = await call<HostSnapshot>(host, 'host:join', {
    gameId: game.gameId,
    authToken: 'host-token',
  });
  if (Object.keys(settings).length) await call(host, 'host:settings', settings);
  const players: { s: Client; id: string }[] = [];
  for (const [i, nick] of nicks.entries()) {
    const s = await client(url);
    const j = await call<JoinRes>(s, 'player:join', {
      pin: snap.pin,
      nickname: nick,
      avatar: ['🦊', '🐼', '🐙', '🦖'][i % 4],
    });
    players.push({ s, id: j.playerId });
  }
  return { game, host, players, sockets: [host, ...players.map((p) => p.s)], rt };
}

/** Avanza hasta que la pregunta i esté abierta (saltando la cuenta atrás). */
async function openQuestion(host: Client, watcher: Client, i: number, first = false) {
  const ready = next(watcher, 'phase', (d) => d.phase === 'getReady' && d.qIndex === i);
  const open = next(watcher, 'phase', (d) => d.phase === 'question' && d.qIndex === i);
  await call(host, first ? 'host:start' : 'host:next');
  await ready;
  await call(host, 'host:skip');
  return open;
}

/** Cierra la pregunta y espera la revelación. */
async function reveal(host: Client): Promise<RevealData> {
  const r = next(host, 'phase', (d) => d.phase === 'reveal');
  await call(host, 'host:skip').catch(() => {}); // puede que ya se haya cerrado sola
  return (await r).reveal!;
}

async function toNextQuestion(host: Client, watcher: Client, i: number) {
  const lb = next(host, 'phase', (d) => d.phase === 'leaderboard');
  await call(host, 'host:next');
  await lb;
  return openQuestion(host, watcher, i);
}

let rt: Realtime;
let url: string;
const cleanups: (() => Promise<void>)[] = [];
const allSockets: Client[] = [];

beforeAll(async () => {
  ({ rt, url } = await startServer());
});

afterAll(async () => {
  allSockets.forEach((s) => s.disconnect());
  for (const c of cleanups) await c();
  await rt.close();
});

function track(g: Awaited<ReturnType<typeof setupGame>>) {
  allSockets.push(...g.sockets);
  cleanups.push(() => cleanupGame(rt, g.game.gameId, g.game.quizId, g.game.quizPlayCount));
}

describe('tipos de pregunta nuevos en vivo', () => {
  it('ordenar, emparejar, deslizador, pin, completar, nube, abierta con votación y dibujo', async () => {
    const questions: GameQuestion[] = [
      {
        id: 'ord',
        type: 'ORDER',
        prompt: 'Ordena',
        options: ['1', '2', '3'].map((n) => ({ id: `o${n}`, text: n, isCorrect: false })),
        config: {},
        ...base,
      },
      {
        id: 'mat',
        type: 'MATCH',
        prompt: 'Empareja',
        options: [],
        config: {
          pairs: [
            { id: 'pa', left: 'A', right: 'a' },
            { id: 'pb', left: 'B', right: 'b' },
          ],
        },
        ...base,
      },
      {
        id: 'sli',
        type: 'SLIDER',
        prompt: 'Número',
        options: [],
        config: { slider: { min: 0, max: 100, step: 1, correct: 40, tolerance: 20 } },
        ...base,
      },
      {
        id: 'pin',
        type: 'PIN',
        prompt: 'Toca',
        options: [],
        config: { pin: { imageUrl: '/demo/x.svg', x: 30, y: 30, radius: 10 } },
        ...base,
      },
      {
        id: 'fil',
        type: 'FILL_BLANK',
        prompt: 'Capital de Perú: ___',
        options: [],
        config: { blanks: [['Lima']] },
        ...base,
      },
      {
        id: 'clo',
        type: 'WORD_CLOUD',
        prompt: 'Una palabra',
        options: [],
        config: { maxWords: 2 },
        ...base,
        points: 'NONE',
      },
      {
        id: 'vot',
        type: 'OPEN_VOTE',
        prompt: 'Lema',
        options: [],
        config: {},
        ...base,
        points: 'NONE',
      },
      {
        id: 'drw',
        type: 'DRAW',
        prompt: 'Dibuja',
        options: [],
        config: { drawWords: ['sol'] },
        ...base,
      },
    ];
    const g = await setupGame(url, rt, questions, ['Ana', 'Beto', 'Caro']);
    track(g);
    const [ana, beto, caro] = g.players;

    // ── Ordenar: el cliente recibe los elementos desordenados ──
    const q0 = await openQuestion(g.host, ana!.s, 0, true);
    const items =
      q0.question?.extra?.kind === 'order' ? q0.question.extra.items.map((i) => i.id) : [];
    expect(items.join()).not.toBe('o1,o2,o3');
    const r0 = next(ana!.s, 'player:result');
    await call(ana!.s, 'player:answer', { qIndex: 0, order: ['o1', 'o2', 'o3'] });
    await call(beto!.s, 'player:answer', { qIndex: 0, order: ['o2', 'o1', 'o3'] });
    await call(caro!.s, 'player:answer', { qIndex: 0, order: ['o3', 'o2', 'o1'] });
    const rev0 = await reveal(g.host);
    expect(rev0.extra).toMatchObject({ kind: 'order', fullyCorrect: 1 });
    expect(((await r0) as PlayerResult).correct).toBe(true);

    // ── Emparejar: tokens ofuscados ──
    const q1 = await toNextQuestion(g.host, ana!.s, 1);
    const extra = q1.question!.extra!;
    if (extra.kind !== 'match') throw new Error('extra inesperado');
    const token = (text: string) => extra.right.find((r) => r.text === text)!.id;
    expect(extra.right.map((r) => r.id)).not.toContain('pa');
    const r1 = next(ana!.s, 'player:result');
    await call(ana!.s, 'player:answer', { qIndex: 1, pairs: { pa: token('a'), pb: token('b') } });
    await call(beto!.s, 'player:answer', { qIndex: 1, pairs: { pa: token('b'), pb: token('a') } });
    await call(caro!.s, 'player:answer', { qIndex: 1, pairs: { pa: token('a') } });
    await reveal(g.host);
    expect(((await r1) as PlayerResult).correctness).toBe(1);

    // ── Deslizador: crédito por cercanía e histograma ──
    await toNextQuestion(g.host, ana!.s, 2);
    const r2a = next(ana!.s, 'player:result');
    const r2b = next(beto!.s, 'player:result');
    await call(ana!.s, 'player:answer', { qIndex: 2, value: 40 });
    await call(beto!.s, 'player:answer', { qIndex: 2, value: 50 });
    await expect(call(caro!.s, 'player:answer', { qIndex: 2, value: 500 })).rejects.toThrow(
      'INVALID_ANSWER',
    );
    const rev2 = await reveal(g.host);
    expect(rev2.extra).toMatchObject({ kind: 'slider', correct: 40, average: 45 });
    expect(((await r2a) as PlayerResult).correctness).toBe(1);
    expect(((await r2b) as PlayerResult).correctness).toBe(0.5);

    // ── Pin en imagen: los toques se muestran en la revelación ──
    await toNextQuestion(g.host, ana!.s, 3);
    await call(ana!.s, 'player:answer', { qIndex: 3, point: { x: 31, y: 29 } });
    await call(beto!.s, 'player:answer', { qIndex: 3, point: { x: 90, y: 90 } });
    const rev3 = await reveal(g.host);
    expect(rev3.extra?.kind === 'pin' && rev3.extra.taps).toHaveLength(2);
    expect(rev3.correctCount).toBe(1);

    // ── Completar espacios ──
    const q4 = await toNextQuestion(g.host, ana!.s, 4);
    expect(q4.question?.extra).toMatchObject({ kind: 'blanks', parts: ['Capital de Perú: ', ''] });
    expect(JSON.stringify(q4)).not.toContain('Lima');
    await call(ana!.s, 'player:answer', { qIndex: 4, blanks: ['lima'] });
    expect((await reveal(g.host)).correctCount).toBe(1);

    // ── Nube de palabras: actualización en vivo agrupada ──
    await toNextQuestion(g.host, ana!.s, 5);
    const cloud = next(g.host, 'cloud:update', (d) =>
      d.words.some(([w, n]) => w === 'alegria' && n === 2),
    );
    await call(ana!.s, 'player:answer', { qIndex: 5, words: ['Alegría', 'paz'] });
    await call(beto!.s, 'player:answer', { qIndex: 5, words: ['alegria'] });
    await cloud;
    const rev5 = await reveal(g.host);
    expect(rev5.extra?.kind === 'cloud' && rev5.extra.words[0]).toEqual(['alegria', 2]);

    // ── Pregunta abierta: escribir → votar → la más votada ──
    await toNextQuestion(g.host, ana!.s, 6);
    await expect(
      call(caro!.s, 'player:answer', { qIndex: 6, text: 'eres un pendejo' }),
    ).rejects.toThrow('OFFENSIVE');
    const vote = next(ana!.s, 'phase', (d) => d.phase === 'vote');
    await call(ana!.s, 'player:answer', { qIndex: 6, text: 'Aprender jugando' });
    await call(beto!.s, 'player:answer', { qIndex: 6, text: 'A toda velocidad' });
    await call(g.host, 'host:skip');
    const candidates = (await vote).candidates!;
    expect(candidates).toHaveLength(2);
    const anaCand = candidates.find((c) => c.text === 'Aprender jugando')!;
    await expect(
      call(ana!.s, 'player:vote', { qIndex: 6, candidateId: anaCand.id }),
    ).rejects.toThrow('OWN_ANSWER');
    await call(beto!.s, 'player:vote', { qIndex: 6, candidateId: anaCand.id });
    await call(caro!.s, 'player:vote', { qIndex: 6, candidateId: anaCand.id });
    await expect(
      call(caro!.s, 'player:vote', { qIndex: 6, candidateId: anaCand.id }),
    ).rejects.toThrow('DUPLICATE');
    const rev6 = await reveal(g.host);
    expect(rev6.extra?.kind === 'vote' && rev6.extra.answers[0]).toMatchObject({
      text: 'Aprender jugando',
      votes: 2,
      nick: 'Ana',
    });

    // ── Dibujo: solo quien dibuja conoce la palabra; los demás adivinan ──
    const metas = g.players.map((p) => next(p.s, 'player:meta'));
    const readyLb = next(g.host, 'phase', (d) => d.phase === 'leaderboard');
    await call(g.host, 'host:next');
    await readyLb;
    const openDraw = next(ana!.s, 'phase', (d) => d.phase === 'question' && d.qIndex === 7);
    await call(g.host, 'host:next');
    const received = await Promise.all(metas);
    const drawerIdx = received.findIndex((m) => m.drawWord);
    expect(received.filter((m) => m.drawWord === 'sol')).toHaveLength(1);
    await call(g.host, 'host:skip');
    const q7 = await openDraw;
    expect(JSON.stringify(q7)).not.toContain('sol');
    const drawer = g.players[drawerIdx]!;
    const guessers = g.players.filter((_, i) => i !== drawerIdx);
    // El trazo llega a los demás, no vuelve a quien dibuja
    const strokeSeen = next(guessers[0]!.s, 'draw:stroke');
    drawer.s.emit('draw:stroke', {
      qIndex: 7,
      stroke: { c: '#1a1640', w: 6, p: [10, 10, 500, 500] },
    });
    expect((await strokeSeen).stroke.p).toEqual([10, 10, 500, 500]);
    await expect(call(drawer.s, 'player:answer', { qIndex: 7, text: 'sol' })).rejects.toThrow(
      'DRAWER',
    );
    expect(await call(guessers[0]!.s, 'player:answer', { qIndex: 7, text: 'luna' })).toMatchObject({
      received: false,
      correct: false,
    });
    await new Promise((r) => setTimeout(r, 900));
    expect(await call(guessers[0]!.s, 'player:answer', { qIndex: 7, text: 'SOL' })).toMatchObject({
      received: true,
      correct: true,
    });
    const rev7 = await reveal(g.host);
    expect(rev7.extra).toMatchObject({ kind: 'draw', word: 'sol', guessed: 1 });
  }, 120_000);
});

describe('modos de juego', () => {
  it('supervivencia: pierde vidas, queda eliminado y termina con un superviviente', async () => {
    const g = await setupGame(url, rt, [mc('s1'), mc('s2'), mc('s3')], ['Viva', 'Cae'], {
      mode: 'SURVIVAL',
      lives: 1,
    });
    track(g);
    const [viva, cae] = g.players;
    await openQuestion(g.host, viva!.s, 0, true);
    const rc = next(cae!.s, 'player:result');
    await call(viva!.s, 'player:answer', { qIndex: 0, optionIds: ['s1-ok'] });
    await call(cae!.s, 'player:answer', { qIndex: 0, optionIds: ['s1-x1'] });
    const r = next(g.host, 'phase', (d) => d.phase === 'reveal');
    const state = (await r).modeState;
    expect(state).toMatchObject({ mode: 'SURVIVAL', alive: 1 });
    expect(await rc).toMatchObject({ lives: 0, eliminated: true, messageKey: 'eliminated' });
    // Queda un superviviente: "Siguiente" va directo al podio
    const podium = next(g.host, 'phase', (d) => d.phase === 'podium');
    await call(g.host, 'host:next');
    expect((await podium).podium?.top[0]?.nick).toBe('Viva');
  });

  it('jefe: los aciertos le quitan vida', async () => {
    const g = await setupGame(url, rt, [mc('b1'), mc('b2')], ['Uno', 'Dos'], { mode: 'BOSS' });
    track(g);
    await openQuestion(g.host, g.players[0]!.s, 0, true);
    const meta0 = await rt.store.meta(g.game.gameId);
    await call(g.players[0]!.s, 'player:answer', { qIndex: 0, optionIds: ['b1-ok'] });
    await call(g.players[1]!.s, 'player:answer', { qIndex: 0, optionIds: ['b1-ok'] });
    const rev = await next(g.host, 'phase', (d) => d.phase === 'reveal');
    const s = rev.modeState!;
    expect(s.mode).toBe('BOSS');
    if (s.mode === 'BOSS') {
      expect(s.maxHp).toBe(meta0!.bossMax);
      expect(s.hp).toBeLessThan(s.maxHp);
      expect(s.lastDamage).toBeGreaterThan(0);
      expect(s.topHitters).toHaveLength(2);
    }
  });

  it('equipos y conquista: reparto equilibrado, clasificación por media y mapa', async () => {
    for (const mode of ['TEAMS', 'TERRITORY'] as const) {
      const g = await setupGame(url, rt, [mc(`t-${mode}`)], ['Aa', 'Bb', 'Cc', 'Dd'], {
        mode,
        teamCount: 2,
        teamTalkSeconds: 0,
      });
      track(g);
      const teams = next(g.players[0]!.s, 'lobby:teams');
      await openQuestion(g.host, g.players[0]!.s, 0, true);
      const assignment = await teams;
      expect(Object.values(assignment).filter((t) => t === 0)).toHaveLength(2);
      for (const p of g.players)
        await call(p.s, 'player:answer', { qIndex: 0, optionIds: [`t-${mode}-ok`] });
      const rev = await next(g.host, 'phase', (d) => d.phase === 'reveal');
      const s = rev.modeState!;
      if (s.mode === 'TEAMS') expect(s.teams).toHaveLength(2);
      if (s.mode === 'TERRITORY') {
        expect(s.grid).toHaveLength(s.cols * s.rows);
        expect(s.grid.every((c) => c === 0 || c === 1)).toBe(true);
      }
    }
  });

  it('carrera: el avance depende de los aciertos', async () => {
    const g = await setupGame(url, rt, [mc('r1'), mc('r2')], ['Rapi', 'Lento'], { mode: 'RACE' });
    track(g);
    await openQuestion(g.host, g.players[0]!.s, 0, true);
    const res = next(g.players[0]!.s, 'player:result');
    await call(g.players[0]!.s, 'player:answer', { qIndex: 0, optionIds: ['r1-ok'] });
    await call(g.players[1]!.s, 'player:answer', { qIndex: 0, optionIds: ['r1-x1'] });
    const rev = await next(g.host, 'phase', (d) => d.phase === 'reveal');
    const s = rev.modeState!;
    if (s.mode !== 'RACE') throw new Error('modo inesperado');
    expect(s.racers.find((r) => r.nick === 'Rapi')?.progress).toBe(0.5);
    expect(s.racers.find((r) => r.nick === 'Lento')?.progress).toBe(0);
    expect((await res).raceProgress).toBe(0.5);
  });

  it('torneo: duelos 1 vs 1 hasta el campeón', async () => {
    const g = await setupGame(url, rt, [mc('d1'), mc('d2'), mc('d3')], ['P1', 'P2', 'P3', 'P4'], {
      mode: 'TOURNAMENT',
    });
    track(g);
    // Ronda 1: P1 y P2 aciertan; P3 y P4 fallan → los ganadores de cada duelo dependen del emparejamiento
    const opponents = g.players.map((p) =>
      next(p.s, 'player:meta', (m) => m.opponent !== undefined),
    );
    await openQuestion(g.host, g.players[0]!.s, 0, true);
    const opp = await Promise.all(opponents);
    expect(opp.every((m) => m.opponent)).toBe(true);
    for (const p of g.players)
      await call(p.s, 'player:answer', { qIndex: 0, optionIds: ['d1-ok'] });
    const rev1 = await next(g.host, 'phase', (d) => d.phase === 'reveal');
    const s1 = rev1.modeState!;
    if (s1.mode !== 'TOURNAMENT') throw new Error('modo inesperado');
    expect(s1.matches).toHaveLength(2);
    expect(s1.matches.every((m) => m.winner)).toBe(true);
    expect(s1.totalRounds).toBe(2);
    // Final entre los dos ganadores; los eliminados no pueden responder
    const winners = s1.matches.map((m) => m.winner!);
    const loser = g.players.find((p) => !winners.includes(p.id))!;
    await toNextQuestion(g.host, g.players[0]!.s, 1);
    await expect(
      call(loser.s, 'player:answer', { qIndex: 1, optionIds: ['d2-ok'] }),
    ).rejects.toThrow('ELIMINATED');
    const champ = g.players.find((p) => p.id === winners[0])!;
    await call(champ.s, 'player:answer', { qIndex: 1, optionIds: ['d2-ok'] });
    const rev2 = await reveal(g.host);
    expect(rev2).toBeTruthy();
    const meta = await rt.store.meta(g.game.gameId);
    expect(meta?.modeState).toMatchObject({ mode: 'TOURNAMENT', champion: { id: champ.id } });
    const podium = next(g.host, 'phase', (d) => d.phase === 'podium');
    await call(g.host, 'host:next');
    expect((await podium).podium?.modeState).toMatchObject({
      mode: 'TOURNAMENT',
      champion: { id: champ.id },
    });
  });
});

describe('power-ups', () => {
  it('50/50, pista, doble, segunda oportunidad, escudo y +10 s', async () => {
    const qs = [
      mc('p1', { hint: 'Empieza por B' }),
      mc('p2'),
      mc('p3'),
      mc('p4', { timeLimit: 5 }),
    ];
    const g = await setupGame(url, rt, qs, ['Power', 'Normal']);
    track(g);
    const [power, normal] = g.players;
    await openQuestion(g.host, power!.s, 0, true);
    const gid = g.game.gameId;
    await rt.store.setPowerUps(gid, power!.id, {
      have: ['fifty', 'hint', 'double', 'second', 'shield', 'time'],
      dbl: -1,
      tx: -1,
      sc: -1,
      sh: false,
    });

    // 50/50 oculta 2 incorrectas; pista; doble puntos
    const fifty = await call<PowerUpResult>(power!.s, 'player:powerup', {
      qIndex: 0,
      type: 'fifty',
    });
    expect(fifty.type === 'fifty' && fifty.hide).toHaveLength(2);
    expect(fifty.type === 'fifty' && fifty.hide).not.toContain('p1-ok');
    expect(await call(power!.s, 'player:powerup', { qIndex: 0, type: 'hint' })).toEqual({
      type: 'hint',
      hint: 'Empieza por B',
    });
    await expect(call(power!.s, 'player:powerup', { qIndex: 0, type: 'fifty' })).rejects.toThrow(
      'POWERUP_NOT_AVAILABLE',
    );
    await call(power!.s, 'player:powerup', { qIndex: 0, type: 'double' });
    const rp = next(power!.s, 'player:result');
    const rn = next(normal!.s, 'player:result');
    await call(power!.s, 'player:answer', { qIndex: 0, optionIds: ['p1-ok'] });
    await call(normal!.s, 'player:answer', { qIndex: 0, optionIds: ['p1-ok'] });
    const [a, b] = (await Promise.all([rp, rn])) as [PlayerResult, PlayerResult];
    expect(a.points).toBeGreaterThan(1000); // puntos dobles
    expect(b.points).toBeLessThanOrEqual(1000);

    // Segunda oportunidad: el primer fallo no cuenta
    await toNextQuestion(g.host, power!.s, 1);
    await call(power!.s, 'player:powerup', { qIndex: 1, type: 'second' });
    expect(await call(power!.s, 'player:answer', { qIndex: 1, optionIds: ['p2-x1'] })).toEqual({
      received: false,
      retry: true,
    });
    await call(power!.s, 'player:answer', { qIndex: 1, optionIds: ['p2-ok'] });
    await call(normal!.s, 'player:answer', { qIndex: 1, optionIds: ['p2-ok'] });
    await reveal(g.host);

    // Escudo: falla sin perder la racha de 2
    await toNextQuestion(g.host, power!.s, 2);
    await call(power!.s, 'player:powerup', { qIndex: 2, type: 'shield' });
    const rs = next(power!.s, 'player:result');
    await call(power!.s, 'player:answer', { qIndex: 2, optionIds: ['p3-x1'] });
    await call(normal!.s, 'player:answer', { qIndex: 2, optionIds: ['p3-ok'] });
    await reveal(g.host);
    expect(await rs).toMatchObject({
      correct: false,
      streak: 2,
      shieldUsed: true,
      messageKey: 'shielded',
    });

    // +10 s: puede responder después de que se acabe el tiempo normal (5 s)
    await toNextQuestion(g.host, power!.s, 3);
    const t = await call<PowerUpResult>(power!.s, 'player:powerup', { qIndex: 3, type: 'time' });
    expect(t.type).toBe('time');
    await call(normal!.s, 'player:answer', { qIndex: 3, optionIds: ['p4-ok'] });
    await new Promise((r) => setTimeout(r, 6500)); // pasa el tiempo normal
    expect((await rt.store.meta(gid))?.phase).toBe('question'); // sigue abierta por el +10 s
    await expect(
      call(power!.s, 'player:answer', { qIndex: 3, optionIds: ['p4-ok'] }),
    ).resolves.toMatchObject({ received: true });
  }, 60_000);
});
