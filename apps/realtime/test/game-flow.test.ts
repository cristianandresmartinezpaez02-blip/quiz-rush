// Prueba de integración: una partida clásica completa con anfitrión y 3 jugadores,
// con Socket.IO, Redis y PostgreSQL reales. Solo se simula la verificación del JWT.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@quiz-rush/db';
import type { HostSnapshot, PlayerResult, PlayerSnapshot } from '@quiz-rush/shared';
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

describe('partida clásica completa', () => {
  let rt: Realtime;
  let url: string;
  let game: Awaited<ReturnType<typeof createTestGame>>;
  const sockets: Client[] = [];

  beforeAll(async () => {
    ({ rt, url } = await startServer());
    game = await createTestGame();
    hostUserId = game.hostId;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await cleanupGame(rt, game.gameId, game.quizId, game.quizPlayCount);
    await rt.close();
  });

  it('juega de principio a fin con el servidor como única autoridad', async () => {
    // ── Anfitrión ──
    const host = await client(url);
    sockets.push(host);
    await expect(
      call(host, 'host:join', { gameId: game.gameId, authToken: 'falso' }),
    ).rejects.toThrow('UNAUTHORIZED');
    const hostSnap = await call<HostSnapshot>(host, 'host:join', {
      gameId: game.gameId,
      authToken: 'host-token',
    });
    expect(hostSnap.phase).toBe('lobby');
    expect(hostSnap.pin).toMatch(/^\d{6}$/);
    await expect(call(host, 'host:start')).rejects.toThrow('NO_PLAYERS');

    // ── Jugadores ──
    const [p1, p2, p3] = await Promise.all([client(url), client(url), client(url)]);
    sockets.push(p1, p2, p3);
    const joinedEvent = next(host, 'lobby:player', (d) => d.count === 3);
    const j1 = await call<JoinRes>(p1, 'player:join', {
      pin: hostSnap.pin,
      nickname: 'Rayo',
      avatar: '🦊',
    });
    const j2 = await call<JoinRes>(p2, 'player:join', {
      pin: hostSnap.pin,
      nickname: 'Tortuga',
      avatar: '🐼',
    });
    await expect(
      call(p3, 'player:join', { pin: hostSnap.pin, nickname: 'rayo', avatar: '🐙' }),
    ).rejects.toThrow('NICK_TAKEN');
    await expect(
      call(p3, 'player:join', { pin: hostSnap.pin, nickname: 'el_puto_amo', avatar: '🐙' }),
    ).rejects.toThrow('NICK_OFFENSIVE');
    await expect(
      call(p3, 'player:join', { pin: '000000', nickname: 'Nadie', avatar: '🐙' }),
    ).rejects.toThrow('PIN_NOT_FOUND');
    await call<JoinRes>(p3, 'player:join', {
      pin: hostSnap.pin,
      nickname: 'Despistado',
      avatar: '🐙',
    });
    expect((await joinedEvent).count).toBe(3);

    // Un jugador no puede dar órdenes de anfitrión
    await expect(call(p1, 'host:start')).rejects.toThrow('NOT_HOST');

    // ── Pregunta 1: opción múltiple ──
    const getReady = next(p1, 'phase', (d) => d.phase === 'getReady');
    const open1 = next(p1, 'phase', (d) => d.phase === 'question');
    await call(host, 'host:start');
    expect((await getReady).question?.prompt).toBe('¿2 + 2?');
    const q1 = await open1;
    // La pregunta pública nunca incluye la respuesta correcta
    expect(JSON.stringify(q1)).not.toContain('isCorrect');
    expect(JSON.stringify(q1)).not.toContain('Dos más dos');

    const reveal1 = next(host, 'phase', (d) => d.phase === 'reveal');
    const r1 = next(p1, 'player:result');
    const r2 = next(p2, 'player:result');
    const r3 = next(p3, 'player:result');
    await call(p1, 'player:answer', { qIndex: 0, optionIds: ['o4'] });
    await expect(call(p1, 'player:answer', { qIndex: 0, optionIds: ['o5'] })).rejects.toThrow(
      'DUPLICATE',
    );
    await expect(
      call(p2, 'player:answer', { qIndex: 0, optionIds: ['inventado'] }),
    ).rejects.toThrow('INVALID_ANSWER');
    await new Promise((r) => setTimeout(r, 600));
    await call(p2, 'player:answer', { qIndex: 0, optionIds: ['o4'] });
    await call(p3, 'player:answer', { qIndex: 0, optionIds: ['o5'] });

    // Todos respondieron: se cierra sin esperar al reloj
    const rev = await reveal1;
    expect(rev.reveal?.correctOptionIds).toEqual(['o4']);
    expect(rev.reveal?.distribution).toEqual({ o4: 2, o5: 1 });
    expect(rev.reveal?.correctCount).toBe(2);
    const [res1, res2, res3] = (await Promise.all([r1, r2, r3])) as [
      PlayerResult,
      PlayerResult,
      PlayerResult,
    ];
    expect(res1.correct && res2.correct).toBe(true);
    expect(res3.correct).toBe(false);
    expect(res1.points).toBeGreaterThan(res2.points); // más rápido = más puntos
    expect(res1.points).toBeLessThanOrEqual(1000);
    expect(res1.rank).toBe(1);
    expect(res3.points).toBe(0);
    expect(res3.rank).toBe(3);

    // ── Ranking ──
    const lb = next(host, 'phase', (d) => d.phase === 'leaderboard');
    await call(host, 'host:next');
    const board = (await lb).leaderboard!;
    expect(board.map((e) => e.nick)).toEqual(['Rayo', 'Tortuga', 'Despistado']);

    // ── Reconexión: Tortuga pierde la conexión y vuelve con su token ──
    p2.disconnect();
    const p2b = await client(url);
    sockets.push(p2b);
    const resumed = await call<PlayerSnapshot>(p2b, 'player:resume', {
      gameId: j2.gameId,
      reconnectToken: j2.reconnectToken,
    });
    expect(resumed.me.score).toBe(res2.total);
    expect(resumed.phase).toBe('leaderboard');
    await expect(
      call(p2b, 'player:resume', { gameId: j2.gameId, reconnectToken: 'robado' }),
    ).rejects.toThrow('PLAYER_NOT_FOUND');

    // ── Pregunta 2: respuesta escrita; solo responde Rayo (los demás agotan el tiempo) ──
    const open2 = next(p1, 'phase', (d) => d.phase === 'question' && d.qIndex === 1);
    await call(host, 'host:next');
    await open2;
    const res1b = next(p1, 'player:result');
    const res2b = next(p2b, 'player:result');
    await call(p1, 'player:answer', { qIndex: 1, text: '  BOGOTA ' });
    const [a, b] = (await Promise.all([res1b, res2b])) as [PlayerResult, PlayerResult];
    expect(a.correct).toBe(true);
    expect(a.streak).toBe(2);
    expect(a.streakBonus).toBe(100); // bono por racha
    expect(b.answered).toBe(false);
    expect(b.messageKey).toBe('noAnswer');
    expect(b.streak).toBe(0); // pierde la racha por no responder

    // ── Podio (última pregunta → directo al podio) ──
    const podium = next(host, 'phase', (d) => d.phase === 'podium');
    const final1 = next(p1, 'player:final');
    await call(host, 'host:next');
    const pod = (await podium).podium!;
    expect(pod.top[0]?.nick).toBe('Rayo');
    expect(pod.highlights.find((h) => h.kind === 'longestStreak')?.nick).toBe('Rayo');
    expect(pod.highlights.find((h) => h.kind === 'perfect')?.nick).toBe('Rayo');
    expect((await final1).rank).toBe(1);

    // ── Guardado en PostgreSQL (en lote, en segundo plano) ──
    await expect
      .poll(async () => (await db.gameSession.findUnique({ where: { id: game.gameId } }))?.status, {
        timeout: 8000,
      })
      .toBe('FINISHED');
    const answers = await db.playerAnswer.count({ where: { gameId: game.gameId } });
    expect(answers).toBe(4);
    const winner = await db.player.findUnique({ where: { id: j1.playerId } });
    expect(winner?.finalRank).toBe(1);
    expect(winner?.bestStreak).toBe(2);
    const quiz = await db.quiz.findUnique({
      where: { id: game.quizId },
      select: { playCount: true },
    });
    expect(quiz?.playCount).toBe(game.quizPlayCount + 3);

    // Partida terminada: nadie más puede entrar
    const late = await client(url);
    sockets.push(late);
    await expect(
      call(late, 'player:join', { pin: hostSnap.pin, nickname: 'Tarde', avatar: '🦖' }),
    ).rejects.toThrow('GAME_OVER');
  });
});

describe('moderación de la sala', () => {
  let rt: Realtime;
  let url: string;
  let game: Awaited<ReturnType<typeof createTestGame>>;
  const sockets: Client[] = [];

  beforeAll(async () => {
    ({ rt, url } = await startServer());
    game = await createTestGame();
    hostUserId = game.hostId;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await cleanupGame(rt, game.gameId, game.quizId, game.quizPlayCount);
    await rt.close();
  });

  it('el anfitrión expulsa jugadores y bloquea la sala', async () => {
    const host = await client(url);
    const p = await client(url);
    const other = await client(url);
    sockets.push(host, p, other);
    const { pin } = await call<HostSnapshot>(host, 'host:join', {
      gameId: game.gameId,
      authToken: 'host-token',
    });
    const { playerId } = await call<JoinRes>(p, 'player:join', {
      pin,
      nickname: 'Troll',
      avatar: '🐸',
    });

    const kicked = next(p, 'player:kicked');
    await call(host, 'host:kick', { playerId });
    await kicked;
    const snap = await call<HostSnapshot>(host, 'host:join', {
      gameId: game.gameId,
      authToken: 'host-token',
    });
    expect(snap.players).toHaveLength(0);

    await call(host, 'host:lock', { locked: true });
    await expect(
      call(other, 'player:join', { pin, nickname: 'Nuevo', avatar: '🐸' }),
    ).rejects.toThrow('ROOM_LOCKED');
  });
});
