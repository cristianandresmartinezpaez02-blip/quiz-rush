// Utilidades para las pruebas de integración del servidor de tiempo real.
// Usan Redis y PostgreSQL reales (los de `npm run infra:up`).
import type { AddressInfo } from 'node:net';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { io as connect, type Socket } from 'socket.io-client';
import { db } from '@quiz-rush/db';
import type { ClientToServerEvents, GameQuestion, ServerToClientEvents } from '@quiz-rush/shared';
import { createRealtime, type Realtime } from '../src/server';

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export const silentLog = pino({ level: process.env.TEST_LOG ?? 'silent' });

export async function startServer(): Promise<{ rt: Realtime; url: string }> {
  const rt = await createRealtime({ port: 0, log: silentLog });
  const { port } = rt.httpServer.address() as AddressInfo;
  return { rt, url: `http://localhost:${port}` };
}

export function client(url: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s: Client = connect(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

/**
 * Emite un evento con ack y devuelve los datos (o lanza el código de error).
 * Las pruebas emiten más rápido que una persona: si el límite de frecuencia salta, se reintenta.
 */
export async function call<T>(s: Client, event: string, ...args: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce<T>(s, event, ...args);
    } catch (err) {
      if ((err as Error).message !== 'RATE_LIMITED' || attempt >= 10) throw err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

function callOnce<T>(s: Client, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    // Si el servidor nunca confirma, la prueba falla con un mensaje claro en vez de colgarse
    const timer = setTimeout(() => reject(new Error(`Sin respuesta a ${event}`)), 15_000);
    // @ts-expect-error: emisión genérica para pruebas
    s.emit(event, ...args, (res: { ok: boolean; data?: T; error?: string }) => {
      clearTimeout(timer);
      if (res.ok) resolve(res.data as T);
      else reject(new Error(res.error));
    });
  });
}

/** Espera al siguiente evento que cumpla la condición. */
export function next<E extends keyof ServerToClientEvents>(
  s: Client,
  event: E,
  match: (data: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
  timeoutMs = 15_000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout esperando ${String(event)}`)),
      timeoutMs,
    );
    const handler = (data: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!match(data)) return;
      clearTimeout(timer);
      // @ts-expect-error: firma genérica
      s.off(event, handler);
      resolve(data);
    };
    // @ts-expect-error: firma genérica
    s.on(event, handler);
  });
}

/** Quiz de prueba con respuestas conocidas. */
export const TEST_QUESTIONS: GameQuestion[] = [
  {
    id: 'tq1',
    type: 'MULTIPLE_CHOICE',
    prompt: '¿2 + 2?',
    timeLimit: 10,
    points: 'NORMAL',
    media: null,
    hint: null,
    explanation: 'Dos más dos son cuatro',
    options: [
      { id: 'o4', text: '4', isCorrect: true },
      { id: 'o5', text: '5', isCorrect: false },
    ],
    config: {},
  },
  {
    id: 'tq2',
    type: 'TYPE_ANSWER',
    prompt: 'Capital de Colombia',
    timeLimit: 5,
    points: 'NORMAL',
    media: null,
    hint: null,
    explanation: null,
    options: [],
    config: { accepted: ['Bogotá'] },
  },
];

/** Crea una GameSession en la BD (como hace POST /api/games de la web). */
export async function createTestGame(questions = TEST_QUESTIONS) {
  const host = await db.user.findUniqueOrThrow({
    where: { email: 'demo@quizrush.dev' },
    select: { id: true },
  });
  const quiz = await db.quiz.findFirstOrThrow({
    where: { status: 'PUBLISHED' },
    select: { id: true, playCount: true },
  });
  const game = await db.gameSession.create({
    data: { quizId: quiz.id, hostId: host.id, quizSnapshot: { questions } as never, settings: {} },
  });
  return { gameId: game.id, hostId: host.id, quizId: quiz.id, quizPlayCount: quiz.playCount };
}

export async function cleanupGame(rt: Realtime, gameId: string, quizId: string, playCount: number) {
  const meta = await rt.store.meta(gameId);
  const redis = (rt.store as unknown as { redis: Redis }).redis;
  const found = await redis.keys(`g:{${gameId}}:*`);
  if (found.length) await redis.del(...found);
  if (meta?.pin) await redis.del(`pin:${meta.pin}`);
  await redis.srem('games:running', gameId);
  await db.gameSession.delete({ where: { id: gameId } }).catch(() => {});
  // Restaura el contador de jugadas del quiz de demostración
  await db.quiz.update({ where: { id: quizId }, data: { playCount } });
}
