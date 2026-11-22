// Prueba de escalabilidad: dos instancias comparten la partida a través de Redis.
// La instancia que lleva los temporizadores "muere" a mitad de pregunta y la otra
// debe retomarla (failover) y cerrar la pregunta a tiempo, sin perder respuestas.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HostSnapshot } from '@quiz-rush/shared';
import type { Realtime } from '../src/server';
import {
  call,
  cleanupGame,
  client,
  createTestGame,
  next,
  startServer,
  TEST_QUESTIONS,
  type Client,
} from './helpers';

let hostUserId = '';
vi.mock('../src/auth', () => ({
  verifyToken: async (token?: string) =>
    token === 'host-token' ? { userId: hostUserId, name: 'Demo', isAnonymous: false } : null,
}));

describe('varias instancias', () => {
  let a: { rt: Realtime; url: string };
  let b: { rt: Realtime; url: string };
  let game: Awaited<ReturnType<typeof createTestGame>>;
  const sockets: Client[] = [];

  beforeAll(async () => {
    [a, b] = await Promise.all([startServer(), startServer()]);
    // Una sola pregunta de 4 s para que la prueba sea rápida
    game = await createTestGame([{ ...TEST_QUESTIONS[0]!, timeLimit: 4 }]);
    hostUserId = game.hostId;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await cleanupGame(b.rt, game.gameId, game.quizId, game.quizPlayCount);
    await b.rt.close();
  });

  it('jugadores en instancias distintas comparten partida y otra instancia retoma el reloj', async () => {
    const host = await client(a.url); // anfitrión en A
    const p1 = await client(a.url); // jugador en A
    const p2 = await client(b.url); // jugador en B
    sockets.push(host, p1, p2);

    const { pin } = await call<HostSnapshot>(host, 'host:join', {
      gameId: game.gameId,
      authToken: 'host-token',
    });
    // El anfitrión (en A) se entera de que entra un jugador conectado a B: adaptador de Redis
    const seen = next(host, 'lobby:player', (d) => d.count === 2);
    await call(p1, 'player:join', { pin, nickname: 'EnA', avatar: '🦊' });
    await call(p2, 'player:join', { pin, nickname: 'EnB', avatar: '🐼' });
    expect((await seen).count).toBe(2);

    const open = next(p2, 'phase', (d) => d.phase === 'question');
    await call(host, 'host:start');
    await open;
    await call(p2, 'player:answer', { qIndex: 0, optionIds: ['o4'] });

    // La instancia A (dueña de los temporizadores) se cae a mitad de pregunta
    await a.rt.close();

    // B retoma la partida cuando caduca la propiedad de A y cierra la pregunta;
    // el jugador de B recibe su resultado personal
    const result = await next(p2, 'player:result', () => true, 20_000);
    expect(result.correct).toBe(true);
    expect(result.points).toBeGreaterThan(0);
    const meta = await b.rt.store.meta(game.gameId);
    expect(meta?.phase).toBe('reveal');
  }, 30_000);
});
