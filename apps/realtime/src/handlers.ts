// Manejadores de eventos del socket: anfitrión, pantalla de espectador y jugadores.
// Toda entrada se valida con Zod y está limitada en frecuencia.
import {
  answerBasePoints,
  answerPayloadSchema,
  EXTRA_TIME_SECONDS,
  fiftyFiftyHide,
  GAME_LIMITS,
  gameSettingsSchema,
  gradeAnswer,
  isScored,
  joinPayloadSchema,
  matchesAcceptedAnswer,
  POWER_UPS,
  powerUpBlocker,
  REACTIONS,
  type Ack,
  type AnswerPayload,
  type GameQuestion,
  type PowerUpResult,
  type Reaction,
  type Stroke,
} from '@quiz-rush/shared';
import { z } from 'zod';
import { verifyToken } from './auth';
import { config, rooms, type Ctx, type GameSocket } from './context';
import type { DuelManager } from './duel';
import { GameError, type GameEngine } from './game/engine';
import type { GameStore } from './game/store';
import { instrumentSocket } from './metrics';
import { captureError } from './sentry';
import { clientIpFrom } from './ip';
import { redisRateLimit, TokenBucket } from './ratelimit';

/** Envuelve un manejador: errores controlados → { ok:false, error }, inesperados → INTERNAL. */
function handle<T>(ctx: Ctx, ack: Ack<T> | undefined, fn: () => Promise<T>) {
  if (typeof ack !== 'function') return; // eventos sin callback: se ignoran
  fn()
    .then((data) => ack({ ok: true, data }))
    .catch((err: unknown) => {
      if (err instanceof GameError) return ack({ ok: false, error: err.message });
      if (err instanceof z.ZodError) return ack({ ok: false, error: 'INVALID_INPUT' });
      ctx.log.error({ err }, 'Error en manejador de socket');
      captureError(err, { where: 'socket-handler' });
      ack({ ok: false, error: 'INTERNAL' });
    });
}

/** Respuesta en formato compacto (lo mínimo para la revelación y el guardado). */
function compactAnswer(q: GameQuestion, a: AnswerPayload): unknown {
  switch (q.type) {
    case 'ORDER':
      return { or: a.order };
    case 'MATCH':
      return { m: a.pairs };
    case 'SLIDER':
      return { v: a.value };
    case 'PIN':
      return { pt: [Math.round(a.point!.x * 10) / 10, Math.round(a.point!.y * 10) / 10] };
    case 'FILL_BLANK':
      return { bl: a.blanks };
    case 'WORD_CLOUD':
      return { w: a.words };
    case 'TYPE_ANSWER':
    case 'OPEN_VOTE':
    case 'DRAW':
      return { t: a.text };
    default:
      return { o: a.optionIds };
  }
}

const STROKE_COLORS = [
  '#1a1640',
  '#ffffff',
  '#e5484d',
  '#fb923c',
  '#ffe14d',
  '#a3e635',
  '#22d3ee',
  '#a78bfa',
  '#f472b6',
  '#8b5a2b',
];
const strokeSchema = z.object({
  c: z.enum(STROKE_COLORS as [string, ...string[]]),
  w: z.number().int().min(2).max(40),
  // Coordenadas enteras 0–1000, como mucho 120 puntos por lote
  p: z.array(z.number().int().min(0).max(1000)).min(2).max(240),
});

/** Agrupa reacciones por partida y las envía a la pantalla cada 300 ms. */
class ReactionBatcher {
  private pending = new Map<string, Partial<Record<Reaction, number>>>();
  private timer: NodeJS.Timeout;
  constructor(private ctx: Ctx) {
    this.timer = setInterval(() => this.flush(), GAME_LIMITS.reactionBatchMs);
  }
  add(g: string, emoji: Reaction) {
    const bucket = this.pending.get(g) ?? {};
    bucket[emoji] = (bucket[emoji] ?? 0) + 1;
    this.pending.set(g, bucket);
  }
  private flush() {
    for (const [g, counts] of this.pending)
      this.ctx.io.to(rooms.screen(g)).emit('reactions', counts);
    this.pending.clear();
  }
  stop() {
    clearInterval(this.timer);
  }
}

export function registerHandlers(
  ctx: Ctx,
  store: GameStore,
  engine: GameEngine,
  duels: DuelManager,
) {
  const reactions = new ReactionBatcher(ctx);

  ctx.io.on('connection', (socket: GameSocket) => {
    instrumentSocket(socket);
    socket.data.ip = clientIpFrom(socket.handshake.headers) ?? socket.handshake.address;
    // Límite general de eventos por socket (ráfaga de 20, 10 por segundo).
    // Los trazos del dibujo tienen su propia cubeta: llegan ~20 lotes por segundo mientras se dibuja.
    const bucket = new TokenBucket(20, 10);
    const strokeBucket = new TokenBucket(40, 30);
    let lastReaction = 0;
    socket.use((packet, next) => {
      const ok = packet[0] === 'draw:stroke' ? strokeBucket.take() : bucket.take();
      if (ok) return next();
      // Si el evento espera confirmación, se responde con el error (si no, el cliente se quedaría esperando)
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') (ack as Ack<never>)({ ok: false, error: 'RATE_LIMITED' });
      else next(new Error('RATE_LIMITED'));
    });

    /** El socket es el anfitrión de su partida. */
    const hostGame = () => {
      if (socket.data.role !== 'host' || !socket.data.gameId) throw new GameError('NOT_HOST');
      return socket.data.gameId;
    };

    // ───────────────────────── Anfitrión ─────────────────────────

    socket.on('host:join', (data, ack) =>
      handle(ctx, ack, async () => {
        const { gameId, authToken } = z
          .object({ gameId: z.string().max(64), authToken: z.string().max(4096) })
          .parse(data);
        const user = await verifyToken(authToken);
        if (!user) throw new GameError('UNAUTHORIZED');
        const meta = await store.init(gameId);
        if (!meta) throw new GameError('GAME_NOT_FOUND');
        if (meta.hostId !== user.userId) throw new GameError('NOT_HOST');
        socket.data = { ...socket.data, role: 'host', gameId, userId: user.userId };
        await socket.join([rooms.all(gameId), rooms.screen(gameId)]);
        return engine.hostSnapshot(gameId);
      }),
    );

    /** Comando del anfitrión sin datos de respuesta. */
    const hostCommand = (fn: (g: string) => Promise<unknown>) => (ack: Ack<null>) =>
      handle(ctx, ack, async () => {
        await fn(hostGame());
        return null;
      });
    socket.on(
      'host:start',
      hostCommand((g) => engine.start(g)),
    );
    socket.on(
      'host:next',
      hostCommand((g) => engine.next(g)),
    );
    socket.on(
      'host:skip',
      hostCommand((g) => engine.skip(g)),
    );
    socket.on(
      'host:end',
      hostCommand((g) => engine.end(g)),
    );

    socket.on('host:kick', (data, ack) =>
      handle(ctx, ack, async () => {
        const g = hostGame();
        const { playerId } = z.object({ playerId: z.string().max(64) }).parse(data);
        if (await store.removePlayer(g, playerId, true)) {
          ctx.io.to(rooms.player(playerId)).emit('player:kicked');
          ctx.io.in(rooms.player(playerId)).socketsLeave([rooms.all(g), rooms.players(g)]);
          const meta = await store.meta(g);
          ctx.io
            .to(rooms.screen(g))
            .emit('lobby:player', { left: playerId, count: meta?.playerCount ?? 0 });
        }
        return null;
      }),
    );

    socket.on('host:lock', (data, ack) =>
      handle(ctx, ack, async () => {
        const g = hostGame();
        const { locked } = z.object({ locked: z.boolean() }).parse(data);
        await store.setMeta(g, { locked: locked ? '1' : '0' });
        ctx.io.to(rooms.all(g)).emit('room:locked', { locked });
        return null;
      }),
    );

    socket.on('host:settings', (data, ack) =>
      handle(ctx, ack, async () => {
        const g = hostGame();
        const meta = await store.meta(g);
        if (!meta) throw new GameError('GAME_NOT_FOUND');
        if (meta.phase !== 'lobby') throw new GameError('ALREADY_STARTED');
        const settings = gameSettingsSchema.parse({
          ...meta.settings,
          ...gameSettingsSchema.partial().parse(data),
        });
        await store.setMeta(g, { settings: JSON.stringify(settings) });
        // Pantallas y celulares ya conectados se enteran del modo elegido
        ctx.io.to(rooms.all(g)).emit('room:settings', settings);
        return settings;
      }),
    );

    // ───────────────────────── Pantalla de espectador ─────────────────────────

    socket.on('spectator:join', (data, ack) =>
      handle(ctx, ack, async () => {
        const { gameId, key } = z
          .object({ gameId: z.string().max(64), key: z.string().max(64) })
          .parse(data);
        const meta = await store.meta(gameId);
        if (!meta || meta.spectatorKey !== key) throw new GameError('GAME_NOT_FOUND');
        socket.data = { ...socket.data, role: 'spectator', gameId };
        await socket.join([rooms.all(gameId), rooms.screen(gameId)]);
        const snapshot = await engine.hostSnapshot(gameId);
        return { ...snapshot, spectatorKey: '' }; // la pantalla no necesita la clave
      }),
    );

    // ───────────────────────── Jugadores ─────────────────────────

    socket.on('player:check', (data, ack) =>
      handle(ctx, ack, async () => {
        if (!(await redisRateLimit(ctx.redis, `join:${socket.data.ip}`, config.joinRatePerMin, 60)))
          throw new GameError('RATE_LIMITED');
        const { pin } = z.object({ pin: z.string().regex(/^\d{6}$/) }).parse(data);
        const gameId = await store.gameIdByPin(pin);
        const meta = gameId ? await store.meta(gameId) : null;
        if (!meta) throw new GameError('PIN_NOT_FOUND');
        if (meta.phase === 'ended' || meta.phase === 'podium') throw new GameError('GAME_OVER');
        if (meta.locked) throw new GameError('ROOM_LOCKED');
        if (meta.phase !== 'lobby' && !meta.settings.allowLateJoin)
          throw new GameError('ALREADY_STARTED');
        return { quizTitle: meta.quizTitle, theme: meta.theme, started: meta.phase !== 'lobby' };
      }),
    );

    socket.on('player:join', (data, ack) =>
      handle(ctx, ack, async () => {
        // Antibots: intentos por minuto por IP (compartido entre instancias)
        if (!(await redisRateLimit(ctx.redis, `join:${socket.data.ip}`, config.joinRatePerMin, 60)))
          throw new GameError('RATE_LIMITED');
        const parsed = joinPayloadSchema.safeParse(data);
        if (!parsed.success) {
          const code = parsed.error.issues.find((i) => i.path[0] === 'nickname')?.message;
          throw new GameError(
            code === 'OFFENSIVE'
              ? 'NICK_OFFENSIVE'
              : parsed.error.issues[0]?.path[0] === 'nickname'
                ? 'NICK_INVALID'
                : 'INVALID_INPUT',
          );
        }
        const { pin, nickname, avatar, authToken } = parsed.data;
        const gameId = await store.gameIdByPin(pin);
        if (!gameId) throw new GameError('PIN_NOT_FOUND');
        const meta = await store.meta(gameId);
        if (!meta || meta.phase === 'ended' || meta.phase === 'podium')
          throw new GameError('GAME_OVER');
        if (meta.locked) throw new GameError('ROOM_LOCKED');
        if (meta.phase !== 'lobby' && !meta.settings.allowLateJoin)
          throw new GameError('ALREADY_STARTED');
        if (meta.playerCount >= meta.settings.maxPlayers) throw new GameError('ROOM_FULL');

        const user = await verifyToken(authToken);
        const res = await store.addPlayer(gameId, { nick: nickname, avatar, userId: user?.userId });
        if (!res.ok) throw new GameError(res.error);
        await engine.modes.onLateJoin(gameId, meta, res.playerId);
        await bindPlayer(socket, gameId, res.playerId);
        const after = await store.meta(gameId);
        ctx.io.to(rooms.screen(gameId)).emit('lobby:player', {
          joined: {
            id: res.playerId,
            nick: nickname,
            avatar,
            team: (await store.teamOf(gameId))[res.playerId] ?? null,
          },
          count: after?.playerCount ?? 0,
        });
        return {
          playerId: res.playerId,
          reconnectToken: res.token,
          gameId,
          snapshot: await engine.playerSnapshot(gameId, res.playerId),
        };
      }),
    );

    // Reconexión: vuelve a la partida sin perder sus puntos
    socket.on('player:resume', (data, ack) =>
      handle(ctx, ack, async () => {
        const { gameId, reconnectToken } = z
          .object({ gameId: z.string().max(64), reconnectToken: z.string().max(64) })
          .parse(data);
        const pid = await store.playerByToken(gameId, reconnectToken);
        if (!pid) throw new GameError('PLAYER_NOT_FOUND');
        const snapshot = await engine.playerSnapshot(gameId, pid);
        await bindPlayer(socket, gameId, pid);
        return snapshot;
      }),
    );

    /** Jugador en partida: devuelve gameId y playerId o lanza NOT_IN_GAME. */
    const playerCtx = () => {
      const { gameId: g, playerId: pid } = socket.data;
      if (socket.data.role !== 'player' || !g || !pid) throw new GameError('NOT_IN_GAME');
      return { g, pid };
    };
    let lastGuess = 0;

    socket.on('player:answer', (data, ack) =>
      handle(ctx, ack, async () => {
        const { g, pid } = playerCtx();
        const answer = answerPayloadSchema.parse(data);
        const meta = await store.meta(g);
        if (!meta || meta.phase !== 'question' || meta.qIndex !== answer.qIndex)
          throw new GameError('CLOSED');
        const q = (await store.quiz(g))[answer.qIndex];
        if (!q) throw new GameError('CLOSED');
        const [ps] = await store.playerResultsData(g, answer.qIndex, [pid]);
        const blocked = await engine.modes.blocker(meta, ps?.pstate ?? null, pid);
        if (blocked) throw new GameError(blocked);

        // El tiempo lo mide el SERVIDOR (desde que abrió la pregunta), nunca el cliente
        const elapsedMs = Math.max(0, Date.now() - meta.qStartedAt);
        const limitMs = meta.endsAt - meta.qStartedAt;
        let grade = gradeAnswer(q, answer);
        if (!grade.valid) throw new GameError(grade.error ?? 'INVALID_ANSWER');

        // Dibujo: quien dibuja no adivina; los intentos fallidos no cuentan (se puede volver a probar)
        if (q.type === 'DRAW') {
          if (meta.drawerId === pid) throw new GameError('DRAWER');
          if (Date.now() - lastGuess < 800) throw new GameError('RATE_LIMITED');
          lastGuess = Date.now();
          const ok = matchesAcceptedAnswer(answer.text ?? '', [meta.drawWord]);
          if (!ok) return { received: false, correct: false };
          grade = { ...grade, correctness: 1 };
        }

        // Power-ups activos para esta pregunta
        const pu = await store.powerUps(g, pid);
        if (pu && pu.sc === answer.qIndex && grade.correctness < 1 && isScored(q)) {
          // Segunda oportunidad: la respuesta incorrecta no cuenta y puede intentarlo otra vez
          await store.setPowerUps(g, pid, { ...pu, sc: -1 });
          return { received: false, retry: true };
        }
        let base = answerBasePoints(
          q,
          grade.correctness,
          elapsedMs,
          limitMs,
          meta.settings.speedEnabled,
        );
        if (pu && pu.dbl === answer.qIndex) base *= 2;
        const extended = pu && pu.tx === answer.qIndex;
        const deadline =
          (extended ? meta.endsAt + EXTRA_TIME_SECONDS * 1000 : meta.endsAt) +
          GAME_LIMITS.answerGraceMs;

        const res = await store.submitAnswer(g, {
          playerId: pid,
          qIndex: answer.qIndex,
          answer: compactAnswer(q, answer),
          correctness: grade.correctness,
          basePoints: base,
          scored: isScored(q),
          elapsedMs,
          distKeys: grade.distributionKeys,
          deadline,
          shield: !!pu?.sh,
        });
        if (!res.ok) throw new GameError(res.error);
        if (res.shieldUsed && pu) await store.setPowerUps(g, pid, { ...pu, sh: false });
        // Si ya respondieron todos, no hace falta esperar al reloj
        void engine.maybeCloseEarly(g, answer.qIndex, res.answered).catch(() => {});
        return { received: true, ...(q.type === 'DRAW' && { correct: true }) };
      }),
    );

    // Pregunta abierta: votar la mejor respuesta (una vez, y no la propia)
    socket.on('player:vote', (data, ack) =>
      handle(ctx, ack, async () => {
        const { g, pid } = playerCtx();
        const { qIndex, candidateId } = z
          .object({ qIndex: z.number().int().min(0), candidateId: z.string().max(32) })
          .parse(data);
        const meta = await store.meta(g);
        if (!meta || meta.phase !== 'vote' || meta.qIndex !== qIndex) throw new GameError('CLOSED');
        const author = meta.candidates[candidateId];
        if (!author) throw new GameError('INVALID_ANSWER');
        if (author === pid) throw new GameError('OWN_ANSWER');
        const res = await store.vote(g, qIndex, pid, author);
        if (!res.ok) throw new GameError('DUPLICATE');
        void engine.maybeCloseVote(g, qIndex, res.total).catch(() => {});
        return { received: true as const };
      }),
    );

    socket.on('player:powerup', (data, ack) =>
      handle(ctx, ack, async (): Promise<PowerUpResult> => {
        const { g, pid } = playerCtx();
        const { qIndex, type } = z
          .object({ qIndex: z.number().int().min(0), type: z.enum(POWER_UPS) })
          .parse(data);
        const meta = await store.meta(g);
        if (!meta || meta.phase !== 'question' || meta.qIndex !== qIndex)
          throw new GameError('CLOSED');
        const q = (await store.quiz(g))[qIndex];
        const pu = await store.powerUps(g, pid);
        if (!q || !pu || !pu.have.includes(type)) throw new GameError('POWERUP_NOT_AVAILABLE');
        const [d] = await store.playerResultsData(g, qIndex, [pid]);
        if (d?.answer) throw new GameError('ALREADY_ANSWERED');
        const blocker = powerUpBlocker(type, q);
        if (blocker) throw new GameError(blocker);

        const next = { ...pu, have: pu.have.filter((p) => p !== type) };
        let result: PowerUpResult;
        switch (type) {
          case 'fifty':
            result = { type, hide: fiftyFiftyHide(q.options) };
            break;
          case 'hint':
            result = { type, hint: q.hint ?? '' };
            break;
          case 'time': {
            next.tx = qIndex;
            const until = meta.endsAt + EXTRA_TIME_SECONDS * 1000;
            await engine.extendQuestion(g, until);
            result = { type, endsAt: until };
            break;
          }
          case 'double':
            next.dbl = qIndex;
            result = { type };
            break;
          case 'second':
            next.sc = qIndex;
            result = { type };
            break;
          case 'shield':
            next.sh = true;
            result = { type };
            break;
        }
        await store.setPowerUps(g, pid, next);
        return result;
      }),
    );

    // Dibujo en vivo: solo quien dibuja, durante la pregunta; los trazos llegan en lotes pequeños
    socket.on('draw:stroke', (data) => {
      void (async () => {
        const { g, pid } = playerCtx();
        const meta = await store.meta(g);
        const parsed = strokeSchema.safeParse((data as { stroke?: unknown })?.stroke);
        if (
          !meta ||
          !parsed.success ||
          meta.drawerId !== pid ||
          !['getReady', 'question'].includes(meta.phase)
        )
          return;
        const stroke: Stroke = parsed.data;
        await store.addStroke(g, meta.qIndex, stroke);
        socket.to(rooms.all(g)).emit('draw:stroke', { qIndex: meta.qIndex, stroke });
      })().catch(() => {});
    });

    socket.on('draw:clear', () => {
      void (async () => {
        const { g, pid } = playerCtx();
        const meta = await store.meta(g);
        if (!meta || meta.drawerId !== pid) return;
        await store.clearStrokes(g, meta.qIndex);
        socket.to(rooms.all(g)).emit('draw:clear', { qIndex: meta.qIndex });
      })().catch(() => {});
    });

    // ───────────────────────── Duelos 1 contra 1 ─────────────────────────
    socket.on('duel:find', (data, ack) => handle(ctx, ack, () => duels.find(socket, data)));
    socket.on('duel:host', (data, ack) => handle(ctx, ack, () => duels.host(socket, data)));
    socket.on('duel:cancel', (ack) =>
      handle(ctx, ack, async () => {
        await duels.leaveQueue(socket);
        return null;
      }),
    );
    socket.on('duel:answer', (data, ack) => handle(ctx, ack, () => duels.answer(socket, data)));
    socket.on('duel:freeze', (data, ack) => handle(ctx, ack, () => duels.freeze(socket, data)));
    socket.on('duel:resume', (data, ack) => handle(ctx, ack, () => duels.resume(socket, data)));
    socket.on('disconnect', () => {
      void duels.leaveQueue(socket).catch(() => {});
    });

    socket.on('player:react', (data) => {
      const g = socket.data.gameId;
      if (socket.data.role !== 'player' || !g) return;
      const now = Date.now();
      if (now - lastReaction < GAME_LIMITS.reactionCooldownMs) return; // una cada 1,5 s
      const emoji = (data as { emoji?: string })?.emoji;
      if (!REACTIONS.includes(emoji as Reaction)) return;
      lastReaction = now;
      reactions.add(g, emoji as Reaction);
    });

    socket.on('player:leave', () => {
      const { gameId: g, playerId: pid } = socket.data;
      if (socket.data.role !== 'player' || !g || !pid) return;
      void (async () => {
        const meta = await store.meta(g);
        // En la sala de espera, salir libera el apodo; con la partida empezada conserva su puntaje
        if (meta?.phase === 'lobby' && (await store.removePlayer(g, pid, false))) {
          const after = await store.meta(g);
          ctx.io
            .to(rooms.screen(g))
            .emit('lobby:player', { left: pid, count: after?.playerCount ?? 0 });
        }
        socket.data = { ip: socket.data.ip };
        socket.rooms.forEach((r) => r !== socket.id && socket.leave(r));
      })().catch(() => {});
    });

    socket.on('ping:rt', (ack) => typeof ack === 'function' && ack(Date.now()));
  });

  async function bindPlayer(socket: GameSocket, gameId: string, playerId: string) {
    socket.data = { ...socket.data, role: 'player', gameId, playerId };
    await socket.join([rooms.all(gameId), rooms.players(gameId), rooms.player(playerId)]);
  }

  // Entrega de resultados pedida por otra instancia
  ctx.io.on('deliver:results', (gameId, qIndex) => {
    engine
      .deliverResults(gameId, qIndex)
      .catch((err) => ctx.log.error({ err }, 'Error entregando resultados'));
  });
  ctx.io.on('deliver:meta', (gameId) => {
    engine
      .deliverMeta(gameId)
      .catch((err) => ctx.log.error({ err }, 'Error entregando datos personales'));
  });
  ctx.io.on('deliver:final', (gameId) => {
    engine
      .deliverFinal(gameId)
      .catch((err) => ctx.log.error({ err }, 'Error entregando resultados finales'));
  });

  return { stop: () => reactions.stop() };
}
