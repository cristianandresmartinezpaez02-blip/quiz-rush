// Duelos 1 contra 1: emparejamiento, congelar, revelado inmediato, final con recompensas,
// duelo privado con código y partida contra el bot. Servidor, Redis y PostgreSQL reales.
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@quiz-rush/db';
import type { DuelView, GameQuestion } from '@quiz-rush/shared';
import type { Realtime } from '../src/server';
import { call, client, next, startServer, type Client } from './helpers';

// Cada token de prueba es "tok:<userId>"
vi.mock('../src/auth', () => ({
  verifyToken: async (token?: string) =>
    token?.startsWith('tok:')
      ? { userId: token.slice(4), name: 'Prueba', isAnonymous: false }
      : null,
}));

let rt: Realtime;
let url: string;
const users: string[] = [];
const sockets: Client[] = [];

async function tempUser(name: string) {
  const id = `duel_${randomUUID().slice(0, 10)}`;
  await db.user.create({ data: { id, name, email: `${id}@test.local` } });
  await db.profile.create({ data: { userId: id, username: id, displayName: name } });
  users.push(id);
  return id;
}

async function sock() {
  const s = await client(url);
  sockets.push(s);
  return s;
}

const redis = () => (rt.store as unknown as { redis: Redis }).redis;

/** Pregunta actual con sus respuestas (leída del estado del servidor, solo en pruebas). */
async function currentQuestion(duelId: string): Promise<GameQuestion> {
  const json = await redis().hget(`duel:${duelId}`, 'json');
  const s = JSON.parse(json!) as { qIndex: number; questions: GameQuestion[] };
  return s.questions[s.qIndex]!;
}

const phase = (s: Client, p: DuelView['phase'], q?: number) =>
  next(s, 'duel:state', (d) => d.phase === p && (q === undefined || d.qIndex === q), 20_000);

beforeAll(async () => {
  ({ rt, url } = await startServer());
  await redis().del('duel:queue');
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  const games = await db.player.findMany({
    where: { userId: { in: users } },
    select: { gameId: true },
  });
  await db.gameSession.deleteMany({ where: { id: { in: games.map((g) => g.gameId) } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await rt.close();
});

describe('duelo 1 contra 1', () => {
  it('emparejamiento, congelar, revelado inmediato y final con recompensas', async () => {
    const [ana, beto] = [await tempUser('Ana'), await tempUser('Beto')];
    const [a, b] = [await sock(), await sock()];
    expect(await call(a, 'duel:find', { authToken: `tok:${ana}` })).toEqual({
      status: 'searching',
    });
    const startA = phase(a, 'countdown');
    expect(await call(b, 'duel:find', { authToken: `tok:${beto}` })).toEqual({ status: 'matched' });
    const v0 = await startA;
    expect(v0.opp).toMatchObject({ nick: 'Beto', bot: false });

    // Pregunta 1: Ana congela a Beto; Beto no puede responder mientras tanto
    const q0 = await phase(a, 'question', 0);
    expect(JSON.stringify(q0.question)).not.toContain('isCorrect');
    const frozen = next(b, 'duel:frozen');
    await call(a, 'duel:freeze', { duelId: v0.id, qIndex: 0 });
    expect((await frozen).until).toBeGreaterThan(Date.now());
    const q = await currentQuestion(v0.id);
    const right = q.options.find((o) => o.isCorrect)!.id;
    const wrong = q.options.find((o) => !o.isCorrect)!.id;
    await expect(
      call(b, 'duel:answer', { duelId: v0.id, qIndex: 0, answer: { optionIds: [right] } }),
    ).rejects.toThrow('FROZEN');
    await expect(call(a, 'duel:freeze', { duelId: v0.id, qIndex: 0 })).rejects.toThrow(
      'POWERUP_NOT_AVAILABLE',
    );
    expect(
      await call(a, 'duel:answer', { duelId: v0.id, qIndex: 0, answer: { optionIds: [right] } }),
    ).toMatchObject({
      correct: true,
    });
    await new Promise((r) => setTimeout(r, 3100)); // se descongela
    // Cuando responden los dos, se revela sin esperar al reloj
    const reveal = phase(a, 'reveal', 0);
    await call(b, 'duel:answer', { duelId: v0.id, qIndex: 0, answer: { optionIds: [wrong] } });
    const r0 = await reveal;
    expect(r0.round).toMatchObject({
      correctOptionIds: [right],
      me: { correct: true },
      opp: { correct: false },
    });

    // Resto de preguntas: Ana acierta, Beto falla
    for (let i = 1; i < v0.total; i++) {
      await phase(a, 'question', i);
      const qi = await currentQuestion(v0.id);
      const ok = qi.options.find((o) => o.isCorrect)!.id;
      const ko = qi.options.find((o) => !o.isCorrect)!.id;
      const rv = phase(a, i === v0.total - 1 ? 'finished' : 'reveal', i);
      await call(a, 'duel:answer', { duelId: v0.id, qIndex: i, answer: { optionIds: [ok] } });
      await call(b, 'duel:answer', { duelId: v0.id, qIndex: i, answer: { optionIds: [ko] } });
      await rv;
    }
    // El estado final con la recompensa llega cuando termina de registrarse
    const end = await next(
      a,
      'duel:state',
      (d) => d.phase === 'finished' && !!d.result?.progress,
      20_000,
    );
    expect(end.result).toMatchObject({ outcome: 'win' });
    expect(end.result!.progress!.xp).toBeGreaterThan(0);
    const stats = await db.profile.findUniqueOrThrow({
      where: { userId: ana },
      select: { stats: true },
    });
    expect((stats.stats as { duelWins: number }).duelWins).toBe(1);
    const session = await db.gameSession.findUniqueOrThrow({
      where: { id: v0.id },
      include: { players: true },
    });
    expect(session).toMatchObject({ mode: 'DUEL', status: 'FINISHED' });
    expect(session.players.find((p) => p.userId === ana)?.finalRank).toBe(1);
  }, 120_000);

  it('duelo privado con código de amigo', async () => {
    const [carla, dani] = [await tempUser('Carla'), await tempUser('Dani')];
    const [c, d] = [await sock(), await sock()];
    const { code } = await call<{ code: string }>(c, 'duel:host', { authToken: `tok:${carla}` });
    expect(code).toMatch(/^\d{4}$/);
    await expect(call(c, 'duel:find', { authToken: `tok:${carla}`, code })).rejects.toThrow(
      'OWN_CODE',
    );
    // Al intentar unirse a su propio código se anuló: se crea otro
    const second = await call<{ code: string }>(c, 'duel:host', { authToken: `tok:${carla}` });
    const started = phase(c, 'countdown');
    expect(await call(d, 'duel:find', { authToken: `tok:${dani}`, code: second.code })).toEqual({
      status: 'matched',
    });
    expect((await started).opp.nick).toBe('Dani');
    await expect(call(d, 'duel:find', { authToken: `tok:${dani}`, code: '0000' })).rejects.toThrow(
      'CODE_NOT_FOUND',
    );
  }, 30_000);

  it('si nadie aparece, se juega contra RushBot', async () => {
    const eva = await tempUser('Eva');
    const e = await sock();
    const started = next(e, 'duel:state', (v) => v.phase === 'countdown', 20_000);
    expect(await call(e, 'duel:find', { authToken: `tok:${eva}` })).toEqual({
      status: 'searching',
    });
    const v = await started;
    expect(v.opp).toMatchObject({ nick: 'RushBot', bot: true });
    // El bot responde solo
    await phase(e, 'question', 0);
    const botAnswered = await next(e, 'duel:state', (s) => s.opp.answered, 15_000);
    expect(botAnswered.qIndex).toBe(0);
  }, 45_000);

  it('sin token válido no se puede jugar', async () => {
    const s = await sock();
    await expect(call(s, 'duel:find', { authToken: 'malo' })).rejects.toThrow('UNAUTHORIZED');
  });
});
