// Duelos 1 contra 1 en tiempo real.
//
//  • Emparejamiento: cola en Redis (compartida por todas las instancias). Si en 12 s no aparece
//    nadie, se juega contra RushBot. También hay duelos privados con un código para un amigo.
//  • Estado en Redis con "compara y cambia" por versión (script Lua): las respuestas pueden llegar
//    a instancias distintas sin pisarse.
//  • La instancia que crea el duelo lleva sus temporizadores; si una respuesta llega a otra
//    instancia, se le avisa con un evento entre servidores para que avance sin esperar al reloj.
//  • El servidor corrige y puntúa; el cliente nunca ve la respuesta antes de tiempo.
import { randomBytes, randomInt } from 'node:crypto';
import { db, type Prisma } from '@quiz-rush/db';
import { recordPlay } from '@quiz-rush/db/progress';
import {
  answerBasePoints,
  answerPayloadSchema,
  computeStreakBonus,
  DEFAULT_AVATAR,
  DUEL_COUNTDOWN_MS,
  DUEL_FREEZE_MS,
  DUEL_FREEZES,
  DUEL_MATCH_TIMEOUT_MS,
  DUEL_QUESTION_SECONDS,
  DUEL_QUESTIONS,
  DUEL_REVEAL_MS,
  gradeAnswer,
  normalizeAvatar,
  toPublicQuestion,
  type AvatarConfig,
  type DuelPhase,
  type DuelView,
  type GameQuestion,
  type ProgressOutcome,
  type PublicQuestion,
} from '@quiz-rush/shared';
import { z } from 'zod';
import { verifyToken } from './auth';
import type { Ctx, GameSocket } from './context';
import { GameError } from './game/engine';

const TTL_SECONDS = 30 * 60;
const QUEUE = 'duel:queue';
const GRACE_MS = 400;
const key = (id: string) => `duel:${id}`;
const codeKey = (code: string) => `duel:code:${code}`;

/** Escribe el estado solo si nadie lo cambió desde que se leyó (versión). */
const CAS = `
if redis.call('HGET', KEYS[1], 'v') == ARGV[1] then
  redis.call('HSET', KEYS[1], 'v', ARGV[2], 'json', ARGV[3])
  redis.call('EXPIRE', KEYS[1], ARGV[4])
  return 1
end
return 0`;

interface Entry {
  userId: string;
  nick: string;
  avatar: AvatarConfig;
  socketId: string;
  ts: number;
}

interface Side {
  userId: string | null;
  nick: string;
  avatar: AvatarConfig;
  bot: boolean;
  socketId: string | null;
  score: number;
  correct: number;
  streak: number;
  bestStreak: number;
  answered: number;
  freezeLeft: number;
  frozenUntil: number;
  /** Respuestas por pregunta: correcto y puntos */
  answers: Record<number, { c: number; p: number }>;
  progress: ProgressOutcome | null;
}

interface DuelState {
  id: string;
  owner: string;
  phase: DuelPhase;
  qIndex: number;
  questions: GameQuestion[];
  current: PublicQuestion | null;
  qStartedAt: number;
  endsAt: number | null;
  sides: [Side, Side];
  startedAt: number;
}

const BOT: Pick<Side, 'nick' | 'avatar'> = {
  nick: 'RushBot',
  avatar: { ...DEFAULT_AVATAR, body: 'robot', color: '#94a3b8', eyes: 'cool', mouth: 'grin' },
};

export class DuelManager {
  private timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  private matchTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private ctx: Ctx) {
    ctx.io.on('duel:check', (id) => {
      void this.checkAdvance(id).catch((err) => ctx.log.error({ err }, 'Error en duelo'));
    });
  }

  stop() {
    for (const list of this.timers.values()) list.forEach(clearTimeout);
    for (const t of this.matchTimers.values()) clearTimeout(t);
    this.timers.clear();
    this.matchTimers.clear();
  }

  // ───────────────────────── Estado ─────────────────────────

  private async read(id: string): Promise<{ s: DuelState; v: string } | null> {
    const [v, json] = await this.ctx.redis.hmget(key(id), 'v', 'json');
    if (!v || !json) return null;
    return { s: JSON.parse(json) as DuelState, v };
  }

  /** Lee, aplica `fn` y guarda con compara-y-cambia (reintenta si otro lo cambió a la vez). */
  private async update(
    id: string,
    fn: (s: DuelState) => boolean | void,
  ): Promise<DuelState | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const cur = await this.read(id);
      if (!cur) return null;
      if (fn(cur.s) === false) return cur.s;
      const next = String(Number(cur.v) + 1);
      const ok = await this.ctx.redis.eval(
        CAS,
        1,
        key(id),
        cur.v,
        next,
        JSON.stringify(cur.s),
        TTL_SECONDS,
      );
      if (ok === 1) return cur.s;
    }
    throw new GameError('BUSY');
  }

  private view(s: DuelState, i: 0 | 1): DuelView {
    const me = s.sides[i];
    const opp = s.sides[i === 0 ? 1 : 0];
    const side = (x: Side) => ({
      nick: x.nick,
      avatar: x.avatar,
      bot: x.bot,
      score: x.score,
      correct: x.correct,
      freezeLeft: x.freezeLeft,
      answered: s.phase === 'question' && !!x.answers[s.qIndex],
      frozenUntil: x.frozenUntil,
    });
    const q = s.questions[s.qIndex];
    const round =
      (s.phase === 'reveal' || s.phase === 'finished') &&
      q &&
      (me.answers[s.qIndex] || s.phase === 'reveal')
        ? {
            qIndex: s.qIndex,
            correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
            me: {
              correct: (me.answers[s.qIndex]?.c ?? 0) >= 1,
              points: me.answers[s.qIndex]?.p ?? 0,
            },
            opp: {
              correct: (opp.answers[s.qIndex]?.c ?? 0) >= 1,
              points: opp.answers[s.qIndex]?.p ?? 0,
            },
          }
        : null;
    return {
      id: s.id,
      phase: s.phase,
      qIndex: s.qIndex,
      total: s.questions.length,
      question: s.phase === 'question' || s.phase === 'reveal' ? s.current : null,
      endsAt: s.endsAt,
      serverNow: Date.now(),
      me: side(me),
      opp: side(opp),
      round,
      result:
        s.phase === 'finished'
          ? {
              outcome: me.score > opp.score ? 'win' : me.score < opp.score ? 'lose' : 'draw',
              progress: me.progress,
            }
          : null,
    };
  }

  /** Cada jugador recibe su propia vista (en su socket, esté en la instancia que esté). */
  private emit(s: DuelState) {
    s.sides.forEach((side, i) => {
      if (side.socketId) this.ctx.io.to(side.socketId).emit('duel:state', this.view(s, i as 0 | 1));
    });
  }

  private sideOf(s: DuelState, userId: string): 0 | 1 {
    const i = s.sides.findIndex((x) => x.userId === userId);
    if (i < 0) throw new GameError('NOT_IN_DUEL');
    return i as 0 | 1;
  }

  // ───────────────────────── Temporizadores (instancia dueña) ─────────────────────────

  private schedule(id: string, at: number, fn: () => Promise<unknown>) {
    const t = setTimeout(
      () => {
        void fn().catch((err) => this.ctx.log.error({ err, duelId: id }, 'Error en duelo'));
      },
      Math.max(0, at - Date.now()),
    );
    this.timers.set(id, [...(this.timers.get(id) ?? []), t]);
  }

  private clearTimers(id: string) {
    this.timers.get(id)?.forEach(clearTimeout);
    this.timers.delete(id);
  }

  // ───────────────────────── Emparejamiento ─────────────────────────

  private async entryFor(socket: GameSocket, authToken: string): Promise<Entry> {
    const user = await verifyToken(authToken);
    if (!user) throw new GameError('UNAUTHORIZED');
    const profile = await db.profile.findUnique({
      where: { userId: user.userId },
      select: { displayName: true, user: { select: { avatar: { select: { config: true } } } } },
    });
    socket.data.userId = user.userId;
    return {
      userId: user.userId,
      nick: (profile?.displayName ?? user.name ?? 'Rusher').slice(0, 24),
      avatar: normalizeAvatar(profile?.user.avatar?.config),
      socketId: socket.id,
      ts: Date.now(),
    };
  }

  async find(socket: GameSocket, data: unknown) {
    const { authToken, code } = z
      .object({
        authToken: z.string().max(4096),
        code: z
          .string()
          .regex(/^\d{4}$/)
          .optional(),
      })
      .parse(data);
    const me = await this.entryFor(socket, authToken);

    if (code) {
      const peek = await this.ctx.redis.get(codeKey(code));
      if (!peek) throw new GameError('CODE_NOT_FOUND');
      if ((JSON.parse(peek) as Entry).userId === me.userId) throw new GameError('OWN_CODE');
      // GETDEL: si dos amigos usan el mismo código a la vez, solo uno entra
      const raw = await this.ctx.redis.getdel(codeKey(code));
      if (!raw) throw new GameError('CODE_NOT_FOUND');
      await this.leaveQueue(socket);
      await this.create(JSON.parse(raw) as Entry, me);
      return { status: 'matched' as const };
    }
    await this.leaveQueue(socket);

    // Busca a alguien esperando (que no sea uno mismo y que siga conectado hace poco)
    const waiting = await this.ctx.redis.lrange(QUEUE, 0, 50);
    for (const raw of waiting) {
      const other = JSON.parse(raw) as Entry;
      if (other.userId === me.userId) continue;
      if (Date.now() - other.ts > DUEL_MATCH_TIMEOUT_MS + 5000) {
        await this.ctx.redis.lrem(QUEUE, 1, raw);
        continue;
      }
      // LREM decide quién se lo lleva si dos lo intentan a la vez
      if ((await this.ctx.redis.lrem(QUEUE, 1, raw)) === 1) {
        await this.create(other, me);
        return { status: 'matched' as const };
      }
    }

    const raw = JSON.stringify(me);
    await this.ctx.redis.rpush(QUEUE, raw);
    socket.data.duelEntry = raw;
    // Nadie en 12 s → contra el bot (si nadie nos emparejó antes)
    const t = setTimeout(() => {
      this.matchTimers.delete(socket.id);
      void (async () => {
        if ((await this.ctx.redis.lrem(QUEUE, 1, raw)) === 1) {
          socket.data.duelEntry = undefined;
          await this.create(me, null);
        }
      })().catch((err) => this.ctx.log.error({ err }, 'Error creando duelo contra el bot'));
    }, DUEL_MATCH_TIMEOUT_MS);
    this.matchTimers.set(socket.id, t);
    return { status: 'searching' as const };
  }

  async host(socket: GameSocket, data: unknown) {
    const { authToken } = z.object({ authToken: z.string().max(4096) }).parse(data);
    const me = await this.entryFor(socket, authToken);
    await this.leaveQueue(socket);
    for (let i = 0; i < 20; i++) {
      const code = String(randomInt(1000, 10_000));
      const ok = await this.ctx.redis.set(codeKey(code), JSON.stringify(me), 'EX', 600, 'NX');
      if (ok === 'OK') {
        socket.data.duelCode = code;
        return { code };
      }
    }
    throw new GameError('INTERNAL');
  }

  /** Sale de la cola o anula su código (al cancelar o desconectarse). */
  async leaveQueue(socket: GameSocket) {
    const t = this.matchTimers.get(socket.id);
    if (t) clearTimeout(t);
    this.matchTimers.delete(socket.id);
    if (socket.data.duelEntry) await this.ctx.redis.lrem(QUEUE, 1, socket.data.duelEntry);
    if (socket.data.duelCode) {
      const raw = await this.ctx.redis.get(codeKey(socket.data.duelCode));
      if (raw && (JSON.parse(raw) as Entry).socketId === socket.id) {
        await this.ctx.redis.del(codeKey(socket.data.duelCode));
      }
    }
    socket.data.duelEntry = undefined;
    socket.data.duelCode = undefined;
  }

  // ───────────────────────── Partida ─────────────────────────

  private async questions(): Promise<GameQuestion[]> {
    const ids = await db.$queryRaw<{ id: string }[]>`
      SELECT x."id" FROM "Question" x JOIN "Quiz" q ON q."id" = x."quizId"
      WHERE q."status" = 'PUBLISHED' AND q."visibility" = 'PUBLIC' AND q."deletedAt" IS NULL
        AND x."type" IN ('MULTIPLE_CHOICE', 'TRUE_FALSE')
        AND (SELECT count(*) FROM "Option" o WHERE o."questionId" = x."id" AND o."isCorrect") = 1
      ORDER BY random() LIMIT ${DUEL_QUESTIONS}`;
    const rows = await db.question.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      select: {
        id: true,
        type: true,
        prompt: true,
        points: true,
        hint: true,
        explanation: true,
        media: true,
        options: {
          orderBy: { position: 'asc' },
          select: { id: true, text: true, isCorrect: true },
        },
      },
    });
    if (rows.length < 3) throw new GameError('NO_QUESTIONS');
    return rows.map((r) => ({
      ...r,
      // Todas las preguntas del duelo duran lo mismo (y siempre puntúan)
      timeLimit: DUEL_QUESTION_SECONDS,
      points: 'NORMAL' as const,
      media: (r.media as GameQuestion['media']) ?? null,
      config: {},
    }));
  }

  private side(e: Entry | null): Side {
    return {
      userId: e?.userId ?? null,
      nick: e?.nick ?? BOT.nick,
      avatar: e?.avatar ?? BOT.avatar,
      bot: !e,
      socketId: e?.socketId ?? null,
      score: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      answered: 0,
      freezeLeft: DUEL_FREEZES,
      frozenUntil: 0,
      answers: {},
      progress: null,
    };
  }

  private async create(a: Entry, b: Entry | null) {
    const id = randomBytes(9).toString('base64url');
    const now = Date.now();
    const s: DuelState = {
      id,
      owner: this.ctx.instanceId,
      phase: 'countdown',
      qIndex: 0,
      questions: await this.questions(),
      current: null,
      qStartedAt: 0,
      endsAt: now + DUEL_COUNTDOWN_MS,
      sides: [this.side(a), this.side(b)],
      startedAt: now,
    };
    await this.ctx.redis
      .multi()
      .hset(key(id), 'v', '1', 'json', JSON.stringify(s))
      .expire(key(id), TTL_SECONDS)
      .exec();
    this.emit(s);
    this.schedule(id, s.endsAt!, () => this.openQuestion(id, 0));
  }

  private async openQuestion(id: string, i: number) {
    const now = Date.now();
    const s = await this.update(id, (s) => {
      if (s.phase === 'finished' || (s.phase === 'question' && s.qIndex === i)) return false;
      s.phase = 'question';
      s.qIndex = i;
      s.qStartedAt = now;
      s.endsAt = now + DUEL_QUESTION_SECONDS * 1000;
      s.current = toPublicQuestion(s.questions[i]!, i, s.questions.length);
    });
    if (!s || s.phase !== 'question' || s.qIndex !== i) return;
    this.emit(s);
    this.schedule(id, s.endsAt! + GRACE_MS, () => this.reveal(id, i));
    const botIdx = s.sides.findIndex((x) => x.bot);
    if (botIdx >= 0) this.scheduleBot(id, i, botIdx as 0 | 1);
  }

  /** RushBot: responde en 2,5–8 s y acierta ~6 de cada 10; a veces congela. */
  private scheduleBot(id: string, i: number, botIdx: 0 | 1) {
    const now = Date.now();
    if (i >= 2 && i <= 4 && randomInt(0, 3) === 0) {
      this.schedule(id, now + 1500, () => this.freezeBy(id, botIdx, i).catch(() => null));
    }
    const answerAt = now + 2500 + randomInt(0, 5500);
    const attempt = async (): Promise<void> => {
      const cur = await this.read(id);
      if (!cur || cur.s.phase !== 'question' || cur.s.qIndex !== i) return;
      const bot = cur.s.sides[botIdx];
      if (bot.answers[i]) return;
      if (bot.frozenUntil > Date.now()) {
        this.schedule(id, bot.frozenUntil + 300, attempt);
        return;
      }
      const q = cur.s.questions[i]!;
      const right = q.options.find((o) => o.isCorrect)!;
      const wrong = q.options.filter((o) => !o.isCorrect);
      const pick =
        randomInt(0, 100) < 62 || !wrong.length ? right : wrong[randomInt(0, wrong.length)]!;
      await this.applyAnswer(id, botIdx, i, { optionIds: [pick.id] }).catch(() => null);
    };
    this.schedule(id, answerAt, attempt);
  }

  private async applyAnswer(id: string, idx: 0 | 1, i: number, answer: unknown) {
    const now = Date.now();
    const payload = answerPayloadSchema.omit({ qIndex: true }).parse(answer);
    let result = { correct: false, points: 0 };
    const s = await this.update(id, (s) => {
      if (s.phase !== 'question' || s.qIndex !== i) throw new GameError('CLOSED');
      if (now > (s.endsAt ?? 0) + GRACE_MS) throw new GameError('TIME_UP');
      const me = s.sides[idx];
      if (me.answers[i]) throw new GameError('DUPLICATE');
      if (me.frozenUntil > now) throw new GameError('FROZEN');
      const q = s.questions[i]!;
      const grade = gradeAnswer(q, { qIndex: i, ...payload });
      if (!grade.valid) throw new GameError('INVALID_ANSWER');
      const limit = DUEL_QUESTION_SECONDS * 1000;
      const elapsed = Math.min(limit, Math.max(0, now - s.qStartedAt));
      let points = 0;
      if (grade.correctness >= 1) {
        me.streak += 1;
        me.correct += 1;
        me.bestStreak = Math.max(me.bestStreak, me.streak);
        points = answerBasePoints(q, 1, elapsed, limit, true) + computeStreakBonus(me.streak);
      } else {
        me.streak = 0;
      }
      me.score += points;
      me.answered += 1;
      me.answers[i] = { c: grade.correctness, p: points };
      result = { correct: grade.correctness >= 1, points };
    });
    if (!s) throw new GameError('NOT_FOUND');
    this.emit(s);
    // ¿Ya respondieron los dos? Que la instancia dueña revele sin esperar al reloj
    if (s.sides.every((x) => x.answers[i])) {
      if (s.owner === this.ctx.instanceId) await this.checkAdvance(id);
      else this.ctx.io.serverSideEmit('duel:check', id);
    }
    return result;
  }

  private async checkAdvance(id: string) {
    const cur = await this.read(id);
    if (!cur || cur.s.owner !== this.ctx.instanceId) return;
    const { s } = cur;
    if (s.phase === 'question' && s.sides.every((x) => x.answers[s.qIndex])) {
      await this.reveal(id, s.qIndex);
    }
  }

  private async reveal(id: string, i: number) {
    const now = Date.now();
    const s = await this.update(id, (s) => {
      if (s.phase !== 'question' || s.qIndex !== i) return false;
      s.phase = 'reveal';
      s.endsAt = now + DUEL_REVEAL_MS;
      // Quien no respondió pierde la racha
      for (const x of s.sides) if (!x.answers[i]) x.streak = 0;
    });
    if (!s || s.phase !== 'reveal' || s.qIndex !== i) return;
    this.clearTimers(id);
    this.emit(s);
    const last = i + 1 >= s.questions.length;
    this.schedule(id, s.endsAt!, () => (last ? this.finish(id) : this.openQuestion(id, i + 1)));
  }

  private async finish(id: string) {
    const s = await this.update(id, (s) => {
      if (s.phase === 'finished') return false;
      s.phase = 'finished';
      s.endsAt = null;
    });
    if (!s) return;
    this.clearTimers(id);
    // El resultado se ve al instante; la recompensa llega en cuanto se registra
    this.emit(s);
    const rankOf = (x: Side, o: Side) => (x.score >= o.score ? 1 : 2);

    // Registro en la base de datos
    await db.gameSession
      .create({
        data: {
          id,
          mode: 'DUEL',
          status: 'FINISHED',
          soloKey: 'duel',
          playerCount: 2,
          settings: { duel: true } as Prisma.InputJsonValue,
          quizSnapshot: { questions: s.questions } as unknown as Prisma.InputJsonValue,
          startedAt: new Date(s.startedAt),
          endedAt: new Date(),
          players: {
            create: s.sides.map((x, i) => ({
              userId: x.userId,
              nickname: x.nick,
              avatar: x.avatar as unknown as Prisma.InputJsonValue,
              score: x.score,
              correctCount: x.correct,
              answeredCount: x.answered,
              bestStreak: x.bestStreak,
              finalRank: rankOf(x, s.sides[i === 0 ? 1 : 0]),
            })),
          },
        },
      })
      .catch((err) => this.ctx.log.error({ err, duelId: id }, 'No se pudo guardar el duelo'));

    // Recompensas (idempotentes por duelo)
    const outcomes = await Promise.all(
      s.sides.map((x, i) => {
        const o = s.sides[i === 0 ? 1 : 0];
        if (!x.userId) return Promise.resolve(null);
        return recordPlay({
          userId: x.userId,
          refId: id,
          mode: 'DUEL',
          correct: x.correct,
          answered: x.answered,
          scoredQuestions: s.questions.length,
          bestStreak: x.bestStreak,
          won: x.score > o.score,
        }).catch((err) => {
          this.ctx.log.error({ err, duelId: id }, 'No se pudo registrar el progreso del duelo');
          return null;
        });
      }),
    );
    const done = await this.update(id, (s) => {
      s.sides.forEach((x, i) => (x.progress = outcomes[i] ?? null));
    });
    if (done) this.emit(done);
  }

  // ───────────────────────── Acciones del jugador ─────────────────────────

  async answer(socket: GameSocket, data: unknown) {
    const { duelId, qIndex, answer } = z
      .object({
        duelId: z.string().max(40),
        qIndex: z.number().int().min(0).max(50),
        answer: z.unknown(),
      })
      .parse(data);
    const userId = socket.data.userId;
    if (!userId) throw new GameError('UNAUTHORIZED');
    const cur = await this.read(duelId);
    if (!cur) throw new GameError('NOT_FOUND');
    return this.applyAnswer(duelId, this.sideOf(cur.s, userId), qIndex, answer);
  }

  async freeze(socket: GameSocket, data: unknown) {
    const { duelId, qIndex } = z
      .object({ duelId: z.string().max(40), qIndex: z.number().int().min(0).max(50) })
      .parse(data);
    const userId = socket.data.userId;
    if (!userId) throw new GameError('UNAUTHORIZED');
    const cur = await this.read(duelId);
    if (!cur) throw new GameError('NOT_FOUND');
    return this.freezeBy(duelId, this.sideOf(cur.s, userId), qIndex);
  }

  private async freezeBy(id: string, idx: 0 | 1, i: number) {
    const until = Date.now() + DUEL_FREEZE_MS;
    const s = await this.update(id, (s) => {
      if (s.phase !== 'question' || s.qIndex !== i) throw new GameError('CLOSED');
      const me = s.sides[idx];
      const opp = s.sides[idx === 0 ? 1 : 0];
      if (me.freezeLeft <= 0) throw new GameError('POWERUP_NOT_AVAILABLE');
      if (opp.answers[i]) throw new GameError('POWERUP_NOT_APPLICABLE');
      me.freezeLeft -= 1;
      opp.frozenUntil = until;
    });
    if (!s) throw new GameError('NOT_FOUND');
    const opp = s.sides[idx === 0 ? 1 : 0];
    if (opp.socketId) this.ctx.io.to(opp.socketId).emit('duel:frozen', { until });
    this.emit(s);
    return { until };
  }

  /** Volver a un duelo tras recargar la página o reconectar. */
  async resume(socket: GameSocket, data: unknown) {
    const { duelId, authToken } = z
      .object({ duelId: z.string().max(40), authToken: z.string().max(4096) })
      .parse(data);
    const user = await verifyToken(authToken);
    if (!user) throw new GameError('UNAUTHORIZED');
    socket.data.userId = user.userId;
    const s = await this.update(duelId, (s) => {
      const i = this.sideOf(s, user.userId);
      s.sides[i].socketId = socket.id;
    });
    if (!s) throw new GameError('NOT_FOUND');
    return this.view(s, this.sideOf(s, user.userId));
  }
}
