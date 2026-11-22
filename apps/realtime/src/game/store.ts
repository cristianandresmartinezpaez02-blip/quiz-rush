// Acceso al estado de una partida en Redis.
import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { db } from '@quiz-rush/db';
import {
  gameSettingsSchema,
  generatePin,
  STREAK_BONUS_MAX,
  STREAK_BONUS_STEP,
  type GamePhase,
  type GameQuestion,
  type GameSettings,
  type LeaderboardEntry,
  type PlayerSummary,
  type PodiumData,
  type RevealData,
} from '@quiz-rush/shared';
import { prepareGameQuestions, type ModeState, type PowerUp, type Stroke } from '@quiz-rush/shared';
import { GAME_TTL_SECONDS, gameKeys, keys } from './keys';
import { CLAIM_OWNER, RESET_MISSING_STREAKS, SUBMIT_ANSWER, TRANSITION } from './lua';

export interface Meta {
  phase: GamePhase;
  qIndex: number;
  qStartedAt: number;
  endsAt: number;
  locked: boolean;
  settings: GameSettings;
  pin: string;
  hostId: string;
  quizId: string;
  quizTitle: string;
  theme: string;
  questionCount: number;
  spectatorKey: string;
  playerCount: number;
  /** Jugadores que pueden responder la pregunta actual (vivos, en duelo, sin contar a quien dibuja) */
  eligible: number;
  /** +10 s de algún jugador: la pregunta no se cierra antes de esta hora */
  extUntil: number;
  modeState: ModeState | null;
  /** Dibujo: quién dibuja y la palabra (la palabra nunca se envía a los demás) */
  drawerId: string;
  drawWord: string;
  drawn: string[];
  /** Jefe: vida actual y máxima */
  bossHp: number;
  bossMax: number;
  /** Torneo: estado de las llaves */
  tour: TourState | null;
  /** Pregunta abierta: token del candidato → autor */
  candidates: Record<string, string>;
  candidatesPublic: { id: string; text: string }[] | null;
  reveal: RevealData | null;
  leaderboard: LeaderboardEntry[] | null;
  podium: PodiumData | null;
}

export interface StoredPlayer {
  n: string; // apodo
  a: string; // avatar
  u?: string; // userId si tiene cuenta
  k?: 1; // expulsado
}

export interface TourState {
  round: number;
  totalRounds: number;
  duels: { a: string; b: string | null; winner: string | null }[];
  champion: string | null;
}

export interface PowerUpState {
  have: PowerUp[];
  /** Pregunta en la que se activó cada efecto (-1 = ninguno) */
  dbl: number;
  tx: number;
  sc: number;
  sh: boolean;
}

export interface PlayerState {
  s: number; // racha
  b: number; // mejor racha
  c: number; // aciertos
  a: number; // respondidas
  bc: number; // mayor subida en el ranking
  l?: number; // vidas (Supervivencia)
}

export interface StoredAnswer {
  a: unknown;
  c: number; // correctness
  p: number; // puntos
  b: number; // bono de racha
  t: number; // ms
  ps: number; // racha previa
}

const parse = <T>(raw: string | null | undefined): T | null =>
  raw ? (JSON.parse(raw) as T) : null;

const randomId = (bytes: number) => randomBytes(bytes).toString('base64url');

/** Caché local de preguntas (son inmutables durante la partida). */
const quizCache = new Map<string, GameQuestion[]>();

export class GameStore {
  constructor(private redis: Redis) {}

  // ───────────────────────── Lectura ─────────────────────────

  async meta(g: string): Promise<Meta | null> {
    const m = await this.redis.hgetall(keys.meta(g));
    if (!m.phase) return null;
    return {
      phase: m.phase as GamePhase,
      qIndex: Number(m.qIndex ?? 0),
      qStartedAt: Number(m.qStartedAt ?? 0),
      endsAt: Number(m.endsAt ?? 0),
      locked: m.locked === '1',
      settings: gameSettingsSchema.parse(parse(m.settings) ?? {}),
      pin: m.pin ?? '',
      hostId: m.hostId ?? '',
      quizId: m.quizId ?? '',
      quizTitle: m.quizTitle ?? '',
      theme: m.theme ?? 'space',
      questionCount: Number(m.questionCount ?? 0),
      spectatorKey: m.spectatorKey ?? '',
      playerCount: Number(m.playerCount ?? 0),
      reveal: parse<RevealData>(m.revealJson),
      leaderboard: parse<LeaderboardEntry[]>(m.lbJson),
      podium: parse<PodiumData>(m.podiumJson),
      eligible: Number(m.eligible ?? m.playerCount ?? 0),
      extUntil: Number(m.extUntil ?? 0),
      modeState: parse<ModeState>(m.modeJson),
      drawerId: m.drawerId ?? '',
      drawWord: m.drawWord ?? '',
      drawn: parse<string[]>(m.drawn) ?? [],
      bossHp: Number(m.bossHp ?? 0),
      bossMax: Number(m.bossMax ?? 0),
      tour: parse<TourState>(m.tourJson),
      candidates: parse<Record<string, string>>(m.candJson) ?? {},
      candidatesPublic: parse<{ id: string; text: string }[]>(m.candPublic),
    };
  }

  async quiz(g: string): Promise<GameQuestion[]> {
    const hit = quizCache.get(g);
    if (hit) return hit;
    const questions = parse<GameQuestion[]>(await this.redis.get(keys.quiz(g))) ?? [];
    if (quizCache.size > 500) quizCache.delete(quizCache.keys().next().value!);
    quizCache.set(g, questions);
    return questions;
  }

  async gameIdByPin(pin: string): Promise<string | null> {
    return this.redis.get(keys.pin(pin));
  }

  async player(g: string, pid: string): Promise<StoredPlayer | null> {
    return parse<StoredPlayer>(await this.redis.hget(keys.players(g), pid));
  }

  /** Jugadores activos (no expulsados) en la sala de espera / partida. */
  async activePlayers(g: string): Promise<PlayerSummary[]> {
    const all = await this.redis.hgetall(keys.players(g));
    return Object.entries(all).flatMap(([id, raw]) => {
      const p = JSON.parse(raw) as StoredPlayer;
      return p.k ? [] : [{ id, nick: p.n, avatar: p.a }];
    });
  }

  async answeredCount(g: string, i: number): Promise<number> {
    return this.redis.hlen(keys.answers(g, i));
  }

  // ───────────────────────── Creación ─────────────────────────

  /**
   * Prepara la partida en Redis a partir de la fila GameSession (creada por la app web).
   * Es idempotente: si ya existe, no hace nada. Reserva un PIN único con SET NX.
   */
  async init(gameId: string): Promise<Meta | null> {
    const existing = await this.meta(gameId);
    if (existing) return existing;

    const game = await db.gameSession.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        hostId: true,
        quizId: true,
        status: true,
        settings: true,
        quizSnapshot: true,
        quiz: { select: { title: true, theme: true } },
      },
    });
    // Solo partidas en vivo (las de un jugador no tienen sala ni están en LOBBY)
    if (!game || game.status !== 'LOBBY' || !game.quizId || !game.quiz) return null;
    // En "Emparejar" se generan tokens aleatorios para el lado derecho (no se puede deducir la pareja)
    const questions = prepareGameQuestions(
      (game.quizSnapshot as unknown as { questions: GameQuestion[] }).questions,
      () => randomId(6),
    );

    let pin = '';
    for (let attempt = 0; attempt < 20 && !pin; attempt++) {
      const candidate = generatePin();
      const ok = await this.redis.set(keys.pin(candidate), gameId, 'EX', GAME_TTL_SECONDS, 'NX');
      if (ok === 'OK') pin = candidate;
    }
    if (!pin) throw new Error('No se pudo reservar un PIN libre');

    const settings = gameSettingsSchema.parse(game.settings ?? {});
    const created = await this.redis.hsetnx(keys.meta(gameId), 'phase', 'lobby');
    if (created === 0) {
      // Otra instancia la inicializó a la vez: liberamos nuestro PIN
      await this.redis.del(keys.pin(pin));
      return this.meta(gameId);
    }
    await this.redis
      .multi()
      .hset(keys.meta(gameId), {
        qIndex: '0',
        qStartedAt: '0',
        endsAt: '0',
        locked: '0',
        settings: JSON.stringify(settings),
        pin,
        hostId: game.hostId ?? '',
        quizId: game.quizId,
        quizTitle: game.quiz.title,
        theme: game.quiz.theme,
        questionCount: String(questions.length),
        spectatorKey: randomId(12),
        playerCount: '0',
      })
      .set(keys.quiz(gameId), JSON.stringify(questions))
      .exec();
    await this.touch(gameId);
    await db.gameSession.update({ where: { id: gameId }, data: { pin } });
    return this.meta(gameId);
  }

  /** Renueva la caducidad de todas las claves de la partida. */
  async touch(g: string) {
    const pipe = this.redis.pipeline();
    for (const k of gameKeys(g)) pipe.expire(k, GAME_TTL_SECONDS);
    await pipe.exec();
  }

  async setMeta(g: string, fields: Record<string, string>) {
    await this.redis.hset(keys.meta(g), fields);
  }

  // ───────────────────────── Jugadores ─────────────────────────

  async addPlayer(
    g: string,
    input: { nick: string; avatar: string; userId?: string },
  ): Promise<{ ok: true; playerId: string; token: string } | { ok: false; error: string }> {
    // Una cuenta = un jugador: si ya estaba, recupera su sitio con un token nuevo
    if (input.userId) {
      const existing = await this.redis.hget(keys.users(g), input.userId);
      if (existing) {
        const p = await this.player(g, existing);
        if (p?.k) return { ok: false, error: 'KICKED' };
        if (p) {
          const token = randomId(24);
          await this.redis.hset(keys.tokens(g), token, existing);
          return { ok: true, playerId: existing, token };
        }
      }
    }
    const playerId = `p_${randomId(12)}`;
    const nickKey = input.nick.toLocaleLowerCase('es');
    if ((await this.redis.hsetnx(keys.nicks(g), nickKey, playerId)) === 0) {
      return { ok: false, error: 'NICK_TAKEN' };
    }
    const token = randomId(24);
    const stored: StoredPlayer = {
      n: input.nick,
      a: input.avatar,
      ...(input.userId && { u: input.userId }),
    };
    const pipe = this.redis
      .multi()
      .hset(keys.players(g), playerId, JSON.stringify(stored))
      .hset(keys.tokens(g), token, playerId)
      .hset(keys.pstate(g), playerId, JSON.stringify({ s: 0, b: 0, c: 0, a: 0, bc: 0 }))
      .zadd(keys.scores(g), 'NX', 0, playerId)
      .hincrby(keys.meta(g), 'playerCount', 1);
    if (input.userId) pipe.hset(keys.users(g), input.userId, playerId);
    await pipe.exec();
    return { ok: true, playerId, token };
  }

  async playerByToken(g: string, token: string): Promise<string | null> {
    return this.redis.hget(keys.tokens(g), token);
  }

  /** Expulsa (o retira de la sala de espera) a un jugador. */
  async removePlayer(g: string, pid: string, kicked: boolean) {
    const p = await this.player(g, pid);
    if (!p || p.k) return false;
    const pipe = this.redis.multi();
    if (kicked) pipe.hset(keys.players(g), pid, JSON.stringify({ ...p, k: 1 }));
    else pipe.hdel(keys.players(g), pid).hdel(keys.pstate(g), pid);
    pipe
      .zrem(keys.scores(g), pid)
      .hdel(keys.nicks(g), p.n.toLocaleLowerCase('es'))
      .hincrby(keys.meta(g), 'playerCount', -1);
    if (p.u && !kicked) pipe.hdel(keys.users(g), p.u);
    await pipe.exec();
    return true;
  }

  // ───────────────────────── Respuestas y fases ─────────────────────────

  async submitAnswer(
    g: string,
    a: {
      playerId: string;
      qIndex: number;
      answer: unknown;
      correctness: number;
      basePoints: number;
      scored: boolean;
      elapsedMs: number;
      distKeys: string[];
      deadline: number;
      shield: boolean;
    },
  ) {
    const res = (await this.redis.eval(
      SUBMIT_ANSWER,
      6,
      keys.meta(g),
      keys.answers(g, a.qIndex),
      keys.pstate(g),
      keys.scores(g),
      keys.counts(g, a.qIndex),
      keys.qinfo(g, a.qIndex),
      a.playerId,
      String(a.qIndex),
      JSON.stringify(a.answer ?? null),
      String(a.correctness),
      String(a.basePoints),
      a.scored ? '1' : '0',
      String(STREAK_BONUS_STEP),
      String(STREAK_BONUS_MAX),
      String(Math.round(a.elapsedMs)),
      JSON.stringify(a.distKeys),
      String(a.deadline),
      String(Date.now()),
      a.shield ? '1' : '0',
    )) as [string, ...(string | number)[]];
    if (res[0] !== 'OK') return { ok: false as const, error: String(res[1]) };
    const [, points, bonus, streak, answered, shieldUsed] = res as [
      string,
      number,
      number,
      number,
      number,
      number,
    ];
    return { ok: true as const, points, bonus, streak, answered, shieldUsed: shieldUsed === 1 };
  }

  /** Cambio de fase atómico (compara y cambia). */
  async transition(
    g: string,
    from: GamePhase,
    fromQ: number | '*',
    to: GamePhase,
    fields: Record<string, string | number> = {},
  ): Promise<boolean> {
    const args = Object.entries(fields).flatMap(([k, v]) => [k, String(v)]);
    const res = await this.redis.eval(
      TRANSITION,
      1,
      keys.meta(g),
      from,
      String(fromQ),
      to,
      ...args,
    );
    return res === 1;
  }

  async resetMissingStreaks(g: string, i: number) {
    await this.redis.eval(
      RESET_MISSING_STREAKS,
      3,
      keys.players(g),
      keys.answers(g, i),
      keys.pstate(g),
    );
  }

  async answers(g: string, i: number): Promise<Record<string, StoredAnswer>> {
    const raw = await this.redis.hgetall(keys.answers(g, i));
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, JSON.parse(v) as StoredAnswer]),
    );
  }

  async counts(g: string, i: number): Promise<Record<string, number>> {
    const raw = await this.redis.hgetall(keys.counts(g, i));
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
  }

  async qinfo(g: string, i: number) {
    const raw = await this.redis.hgetall(keys.qinfo(g, i));
    return {
      correct: Number(raw.correct ?? 0),
      fastestMs: raw.fastestMs ? Number(raw.fastestMs) : null,
      fastestPid: raw.fastestPid ?? null,
    };
  }

  /**
   * Recalcula los puestos tras una pregunta: guarda los anteriores en `prevRanks`,
   * los nuevos en `ranks` y actualiza la mayor subida de cada jugador.
   */
  async recomputeRanks(g: string) {
    const ordered = await this.redis.zrevrange(keys.scores(g), 0, -1);
    const prev = await this.redis.hgetall(keys.ranks(g));
    const pstateRaw = await this.redis.hgetall(keys.pstate(g));
    const pipe = this.redis.multi();
    pipe.del(keys.prevRanks(g));
    if (Object.keys(prev).length) pipe.hset(keys.prevRanks(g), prev);
    const next: Record<string, string> = {};
    ordered.forEach((pid, i) => {
      const rank = i + 1;
      next[pid] = String(rank);
      const before = prev[pid] ? Number(prev[pid]) : null;
      const ps = parse<PlayerState>(pstateRaw[pid]);
      if (ps && before !== null && before - rank > (ps.bc ?? 0)) {
        pipe.hset(keys.pstate(g), pid, JSON.stringify({ ...ps, bc: before - rank }));
      }
    });
    pipe.del(keys.ranks(g));
    if (ordered.length) pipe.hset(keys.ranks(g), next);
    await pipe.exec();
  }

  /** Top N del ranking con su puesto anterior y racha. */
  async leaderboard(g: string, size: number): Promise<LeaderboardEntry[]> {
    const flat = await this.redis.zrevrange(keys.scores(g), 0, size - 1, 'WITHSCORES');
    const ids: string[] = [];
    for (let i = 0; i < flat.length; i += 2) ids.push(flat[i]!);
    if (ids.length === 0) return [];
    const [players, prev, pstate, teams] = await Promise.all([
      this.redis.hmget(keys.players(g), ...ids),
      this.redis.hmget(keys.prevRanks(g), ...ids),
      this.redis.hmget(keys.pstate(g), ...ids),
      this.redis.hmget(keys.teams(g), ...ids),
    ]);
    return ids.map((id, i) => {
      const p = parse<StoredPlayer>(players[i]);
      const ps = parse<PlayerState>(pstate[i]);
      return {
        id,
        nick: p?.n ?? '—',
        avatar: p?.a ?? '🙂',
        score: Number(flat[i * 2 + 1]),
        rank: i + 1,
        prevRank: prev[i] ? Number(prev[i]) : null,
        streak: ps?.s ?? 0,
        ...(ps?.l !== undefined && { lives: ps.l }),
        ...(teams[i] !== null && teams[i] !== undefined && { team: Number(teams[i]) }),
      };
    });
  }

  /** Datos personales de varios jugadores para entregar resultados (una sola ida a Redis). */
  async playerResultsData(g: string, i: number, pids: string[]) {
    if (pids.length === 0) return [];
    const pipe = this.redis.pipeline();
    for (const pid of pids) {
      pipe.hget(keys.answers(g, i), pid);
      pipe.hget(keys.ranks(g), pid);
      pipe.hget(keys.prevRanks(g), pid);
      pipe.zscore(keys.scores(g), pid);
      pipe.hget(keys.pstate(g), pid);
    }
    const res = (await pipe.exec()) ?? [];
    return pids.map((pid, n) => {
      const v = (k: number) => res[n * 5 + k]?.[1] as string | null;
      return {
        pid,
        answer: parse<StoredAnswer>(v(0)),
        rank: v(1) ? Number(v(1)) : null,
        prevRank: v(2) ? Number(v(2)) : null,
        total: v(3) ? Number(v(3)) : 0,
        pstate: parse<PlayerState>(v(4)),
      };
    });
  }

  async allScores(g: string) {
    const flat = await this.redis.zrevrange(keys.scores(g), 0, -1, 'WITHSCORES');
    const out: { pid: string; score: number; rank: number }[] = [];
    for (let i = 0; i < flat.length; i += 2)
      out.push({ pid: flat[i]!, score: Number(flat[i + 1]), rank: i / 2 + 1 });
    return out;
  }

  async allPlayerStates(g: string) {
    const raw = await this.redis.hgetall(keys.pstate(g));
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, JSON.parse(v) as PlayerState]),
    );
  }

  async allPlayers(g: string) {
    const raw = await this.redis.hgetall(keys.players(g));
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, JSON.parse(v) as StoredPlayer]),
    );
  }

  // ───────────────────────── Modos, power-ups, votos y dibujo ─────────────────────────

  async teamOf(g: string): Promise<Record<string, number>> {
    const raw = await this.redis.hgetall(keys.teams(g));
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
  }

  async setTeams(g: string, teams: Record<string, number>) {
    const pipe = this.redis.multi().del(keys.teams(g));
    if (Object.keys(teams).length)
      pipe.hset(
        keys.teams(g),
        Object.fromEntries(Object.entries(teams).map(([k, v]) => [k, String(v)])),
      );
    await pipe.exec();
  }

  async setTeam(g: string, pid: string, team: number) {
    await this.redis.hset(keys.teams(g), pid, String(team));
  }

  async powerUps(g: string, pid: string): Promise<PowerUpState | null> {
    return parse<PowerUpState>(await this.redis.hget(keys.powerups(g), pid));
  }

  async setPowerUps(g: string, pid: string, state: PowerUpState) {
    await this.redis.hset(keys.powerups(g), pid, JSON.stringify(state));
  }

  async setAllPowerUps(g: string, states: Record<string, PowerUpState>) {
    const pipe = this.redis.multi().del(keys.powerups(g));
    const entries = Object.entries(states);
    if (entries.length)
      pipe.hset(
        keys.powerups(g),
        Object.fromEntries(entries.map(([k, v]) => [k, JSON.stringify(v)])),
      );
    await pipe.exec();
  }

  /** Escribe el estado de varios jugadores (solo entre preguntas: no compite con las respuestas). */
  async setPlayerStates(g: string, states: Record<string, PlayerState>) {
    const entries = Object.entries(states);
    if (entries.length)
      await this.redis.hset(
        keys.pstate(g),
        Object.fromEntries(entries.map(([k, v]) => [k, JSON.stringify(v)])),
      );
  }

  async addScore(g: string, pid: string, points: number) {
    if (points) await this.redis.zincrby(keys.scores(g), points, pid);
  }

  /** Registra un voto (una sola vez por votante). */
  async vote(
    g: string,
    i: number,
    voter: string,
    author: string,
  ): Promise<{ ok: boolean; total: number }> {
    const first = await this.redis.hsetnx(keys.voters(g, i), voter, author);
    if (!first) return { ok: false, total: 0 };
    const [, total] = (await this.redis
      .multi()
      .hincrby(keys.votes(g, i), author, 1)
      .hlen(keys.voters(g, i))
      .exec()) as [[null, number], [null, number]];
    return { ok: true, total: total[1] };
  }

  async votes(g: string, i: number): Promise<Record<string, number>> {
    const raw = await this.redis.hgetall(keys.votes(g, i));
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
  }

  async addStroke(g: string, i: number, stroke: Stroke) {
    await this.redis
      .multi()
      .rpush(keys.strokes(g, i), JSON.stringify(stroke))
      .ltrim(keys.strokes(g, i), -3000, -1)
      .expire(keys.strokes(g, i), GAME_TTL_SECONDS)
      .exec();
  }

  async clearStrokes(g: string, i: number) {
    await this.redis.del(keys.strokes(g, i));
  }

  async strokes(g: string, i: number): Promise<Stroke[]> {
    return (await this.redis.lrange(keys.strokes(g, i), 0, -1)).map((s) => JSON.parse(s) as Stroke);
  }

  // ───────────────────────── Temporizadores ─────────────────────────

  async claimOwner(g: string, instanceId: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.eval(CLAIM_OWNER, 1, keys.owner(g), instanceId, String(ttlMs))) === 1;
  }

  async markRunning(g: string, running: boolean) {
    if (running) await this.redis.sadd(keys.running(), g);
    else await this.redis.srem(keys.running(), g);
  }

  async runningGames(): Promise<string[]> {
    return this.redis.smembers(keys.running());
  }

  async releasePin(pin: string, afterSec: number) {
    if (pin) await this.redis.expire(keys.pin(pin), afterSec);
  }
}
