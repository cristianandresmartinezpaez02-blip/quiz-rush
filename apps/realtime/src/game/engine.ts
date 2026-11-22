// Motor de la partida en vivo.
//
// Principios:
//  • El servidor es la ÚNICA autoridad sobre el tiempo y los puntajes.
//  • Todo el estado está en Redis; los cambios de fase son atómicos (compara y cambia), así que
//    varias instancias pueden intentar la misma transición y solo una la aplica.
//  • Los temporizadores los lleva la instancia "dueña" de la partida. Si muere, su propiedad
//    caduca y el barrendero de otra instancia la retoma (failover).
//  • Los resultados personales los entrega CADA instancia a sus jugadores conectados
//    (fan-out local), en vez de publicar 2.000 mensajes por Redis.
import { randomBytes, randomInt } from 'node:crypto';
import {
  buildRevealExtra,
  computeHighlights,
  finalMessageKey,
  GAME_LIMITS,
  isScored,
  resultMessageKey,
  TEAM_MODES,
  toPublicQuestion,
  topWords,
  type GamePhase,
  type GameQuestion,
  type GameSnapshot,
  type HostSnapshot,
  type PlayerResult,
  type PlayerSnapshot,
  type PlayerSummary,
  type PodiumData,
  type PublicQuestion,
  type RevealData,
  type ServerToClientEvents,
} from '@quiz-rush/shared';
import { config, rooms, type Ctx } from '../context';
import { ModeRunner, vehicleFor } from './modes';
import { markCancelled, markStarted, persistFinal, persistQuestion } from './persist';
import type { GameStore, Meta, PlayerState, StoredAnswer } from './store';

export class GameError extends Error {}

type PhasePayload = Parameters<ServerToClientEvents['phase']>[0];

/** Duración de la votación de la pregunta abierta. */
const VOTE_SECONDS = 20;
/** Como mucho se votan 12 respuestas (en salas grandes se elige una muestra). */
const MAX_CANDIDATES = 12;

export class GameEngine {
  private timers = new Map<string, NodeJS.Timeout>();
  private tickers = new Map<string, { timer: NodeJS.Timeout; last: string }>();
  private owned = new Set<string>();
  private loops: NodeJS.Timeout[] = [];
  readonly modes: ModeRunner;

  constructor(
    private ctx: Ctx,
    private store: GameStore,
  ) {
    this.modes = new ModeRunner(store);
  }

  // ───────────────────────── Ciclo de vida del motor ─────────────────────────

  startLoops() {
    // Renueva la propiedad de las partidas que lleva esta instancia
    this.loops.push(
      setInterval(() => {
        for (const g of this.owned) {
          this.store
            .claimOwner(g, this.ctx.instanceId, config.ownerTtlMs)
            .then((mine) => !mine && this.dropGame(g))
            .catch(() => {});
        }
      }, config.ownerRenewMs),
    );
    // Barrendero: retoma partidas cuya instancia dueña desapareció
    this.loops.push(setInterval(() => void this.sweep().catch(() => {}), config.sweepIntervalMs));
  }

  stop() {
    for (const t of this.loops) clearInterval(t);
    for (const g of [...this.owned]) this.dropGame(g);
  }

  private dropGame(g: string) {
    this.owned.delete(g);
    clearTimeout(this.timers.get(g));
    this.timers.delete(g);
    this.stopTicker(g);
  }

  private async own(g: string) {
    if (await this.store.claimOwner(g, this.ctx.instanceId, config.ownerTtlMs)) this.owned.add(g);
  }

  private async sweep() {
    for (const g of await this.store.runningGames()) {
      if (this.owned.has(g)) continue;
      if (await this.store.claimOwner(g, this.ctx.instanceId, config.ownerTtlMs)) {
        this.owned.add(g);
        this.ctx.log.info({ gameId: g }, 'Partida retomada por esta instancia (failover)');
        await this.reconcile(g);
      }
    }
  }

  /** Reprograma los temporizadores según el estado guardado en Redis. */
  private async reconcile(g: string) {
    const meta = await this.store.meta(g);
    if (!meta) return this.store.markRunning(g, false);
    if (meta.phase === 'getReady')
      this.schedule(g, meta.endsAt, () => this.openQuestion(g, meta.qIndex));
    else if (meta.phase === 'question') {
      this.schedule(g, closeAt(meta), () => this.closeQuestion(g, meta.qIndex));
      this.startTicker(g, meta.qIndex);
    } else if (meta.phase === 'vote') {
      this.schedule(g, meta.endsAt, () => this.finalize(g, meta.qIndex, 'vote'));
    } else if (meta.phase === 'podium' || meta.phase === 'ended') {
      await this.store.markRunning(g, false);
    }
  }

  private schedule(g: string, at: number, fn: () => Promise<unknown>) {
    clearTimeout(this.timers.get(g));
    const timer = setTimeout(
      () => {
        this.timers.delete(g);
        fn().catch((err) => this.ctx.log.error({ err, gameId: g }, 'Error en temporizador'));
      },
      Math.max(0, at - Date.now()),
    );
    this.timers.set(g, timer);
  }

  /**
   * Cada 500 ms (como mucho): contador de respuestas para la pantalla y, en la nube de
   * palabras, las palabras más repetidas. Así una sala de 2.000 no genera 2.000 mensajes.
   */
  private startTicker(g: string, qIndex: number) {
    this.stopTicker(g);
    const state = {
      last: '',
      timer: setInterval(async () => {
        try {
          const [answered, meta, questions] = await Promise.all([
            this.store.answeredCount(g, qIndex),
            this.store.meta(g),
            this.store.quiz(g),
          ]);
          const isCloud = questions[qIndex]?.type === 'WORD_CLOUD';
          const words = isCloud ? topWords(await this.store.counts(g, qIndex), 40) : null;
          const key = `${answered}|${JSON.stringify(words)}`;
          if (key === state.last) return;
          state.last = key;
          this.ctx.io
            .to(rooms.screen(g))
            .emit('answers:count', { qIndex, answered, players: meta?.eligible ?? 0 });
          if (words) this.ctx.io.to(rooms.all(g)).emit('cloud:update', { qIndex, words });
        } catch {
          /* se reintenta en el siguiente ciclo */
        }
      }, GAME_LIMITS.answerCountIntervalMs),
    };
    this.tickers.set(g, state);
  }

  private stopTicker(g: string) {
    const t = this.tickers.get(g);
    if (t) clearInterval(t.timer);
    this.tickers.delete(g);
  }

  private broadcast(g: string, payload: Omit<PhasePayload, 'serverNow'>) {
    this.ctx.io.to(rooms.all(g)).emit('phase', { ...payload, serverNow: Date.now() });
  }

  private async requireMeta(g: string): Promise<Meta> {
    const meta = await this.store.meta(g);
    if (!meta) throw new GameError('GAME_NOT_FOUND');
    return meta;
  }

  /** Pregunta pública con los datos del dibujo (quien dibuja) si corresponde. */
  async publicQuestion(g: string, meta: Meta, i: number): Promise<PublicQuestion | null> {
    const questions = await this.store.quiz(g);
    const q = questions[i];
    if (!q) return null;
    let drawer: PlayerSummary | null = null;
    if (q.type === 'DRAW' && meta.drawerId) {
      const p = await this.store.player(g, meta.drawerId);
      if (p) drawer = { id: meta.drawerId, nick: p.n, avatar: p.a };
    }
    return toPublicQuestion(q, i, questions.length, { drawer, word: meta.drawWord || null });
  }

  // ───────────────────────── Instantáneas (entrar / reconectar) ─────────────────────────

  private async baseSnapshot(g: string, meta: Meta): Promise<GameSnapshot> {
    const showQuestion = ['getReady', 'question', 'vote', 'reveal'].includes(meta.phase);
    const question = showQuestion ? await this.publicQuestion(g, meta, meta.qIndex) : null;
    return {
      gameId: g,
      pin: meta.pin,
      phase: meta.phase,
      quizTitle: meta.quizTitle,
      theme: meta.theme,
      questionCount: meta.questionCount,
      qIndex: meta.qIndex,
      locked: meta.locked,
      settings: meta.settings,
      playerCount: meta.playerCount,
      question,
      endsAt: ['getReady', 'question', 'vote'].includes(meta.phase)
        ? Math.max(meta.endsAt, 0)
        : null,
      serverNow: Date.now(),
      reveal: meta.phase === 'reveal' ? meta.reveal : null,
      leaderboard: meta.phase === 'leaderboard' ? meta.leaderboard : null,
      podium: meta.phase === 'podium' || meta.phase === 'ended' ? meta.podium : null,
      modeState: meta.modeState,
      candidates: meta.phase === 'vote' ? meta.candidatesPublic : null,
      strokes:
        question?.type === 'DRAW' && ['question', 'getReady'].includes(meta.phase)
          ? await this.store.strokes(g, meta.qIndex)
          : null,
    };
  }

  async hostSnapshot(g: string): Promise<HostSnapshot> {
    const meta = await this.requireMeta(g);
    const [base, players, answered, teams] = await Promise.all([
      this.baseSnapshot(g, meta),
      this.store.activePlayers(g),
      this.store.answeredCount(g, meta.qIndex),
      this.store.teamOf(g),
    ]);
    return {
      ...base,
      players: players.map((p) => ({ ...p, team: teams[p.id] ?? null })),
      spectatorKey: meta.spectatorKey,
      answered,
    };
  }

  async playerSnapshot(g: string, pid: string): Promise<PlayerSnapshot> {
    const meta = await this.requireMeta(g);
    const player = await this.store.player(g, pid);
    if (!player || player.k) throw new GameError('PLAYER_NOT_FOUND');
    const [base, [data], pu, teams] = await Promise.all([
      this.baseSnapshot(g, meta),
      this.store.playerResultsData(g, meta.qIndex, [pid]),
      this.store.powerUps(g, pid),
      this.store.teamOf(g),
    ]);
    const lastResult =
      meta.phase === 'reveal' || meta.phase === 'leaderboard'
        ? this.buildResult(meta, (await this.store.quiz(g))[meta.qIndex], data!, teams)
        : null;
    const ps = data?.pstate;
    const isDrawer = meta.drawerId === pid && ['getReady', 'question'].includes(meta.phase);
    return {
      ...base,
      me: {
        id: pid,
        nick: player.n,
        avatar: player.a,
        score: data?.total ?? 0,
        rank: data?.rank ?? null,
        team: teams[pid] ?? null,
        lives: ps?.l ?? null,
        eliminated: (await this.modes.blocker(meta, ps ?? null, pid)) !== null,
        powerUps: pu?.have ?? [],
        vehicle: meta.settings.mode === 'RACE' ? vehicleFor(player.a) : null,
      },
      answeredCurrent: !!data?.answer && meta.phase === 'question',
      lastResult,
      drawWord: isDrawer ? meta.drawWord : null,
    };
  }

  // ───────────────────────── Fases ─────────────────────────

  async start(g: string) {
    const meta = await this.requireMeta(g);
    if (meta.phase !== 'lobby') throw new GameError('ALREADY_STARTED');
    if (meta.playerCount < 1) throw new GameError('NO_PLAYERS');
    if (meta.questionCount < 1) throw new GameError('NO_QUESTIONS');
    if (TEAM_MODES.includes(meta.settings.mode) && meta.playerCount < 2)
      throw new GameError('NEED_TWO_PLAYERS');

    const fields = await this.modes.setup(g, meta, await this.store.quiz(g));
    await this.store.setMeta(g, fields);
    if (TEAM_MODES.includes(meta.settings.mode)) {
      this.ctx.io.to(rooms.all(g)).emit('lobby:teams', await this.store.teamOf(g));
    }
    await this.getReady(g, 0, 'lobby', '*');
    await this.store.markRunning(g, true);
    markStarted(g, meta.settings.mode).catch((err) =>
      this.ctx.log.error({ err }, 'No se pudo marcar la partida como iniciada'),
    );
  }

  /** "¡Prepárate!" (en modo Equipos, tiempo para discutir). En el dibujo se elige quién dibuja. */
  private async getReady(g: string, i: number, from: GamePhase, fromQ: number | '*') {
    const meta = await this.requireMeta(g);
    const questions = await this.store.quiz(g);
    const q = questions[i];
    if (!q) return;
    const talk = meta.settings.mode === 'TEAMS' ? meta.settings.teamTalkSeconds : 0;
    const endsAt = Date.now() + Math.max(GAME_LIMITS.getReadySeconds, talk) * 1000;

    const fields: Record<string, string | number> = { qIndex: i, endsAt, extUntil: 0 };
    if (q.type === 'DRAW') {
      const { drawerId, word } = await this.pickDrawer(g, meta, q);
      fields.drawerId = drawerId;
      fields.drawWord = word;
      fields.drawn = JSON.stringify([...meta.drawn, drawerId]);
    } else {
      fields.drawerId = '';
      fields.drawWord = '';
    }
    const ok = await this.store.transition(g, from, fromQ, 'getReady', fields);
    if (!ok) return;
    await this.store.touch(g);
    const fresh = await this.requireMeta(g);
    this.broadcast(g, {
      phase: 'getReady',
      qIndex: i,
      question: await this.publicQuestion(g, fresh, i),
      endsAt,
      modeState: fresh.modeState,
    });
    // Información personal para la pregunta: palabra secreta, rival del torneo…
    this.ctx.io.serverSideEmit('deliver:meta', g);
    await this.deliverMeta(g);
    await this.own(g);
    this.schedule(g, endsAt, () => this.openQuestion(g, i));
  }

  /** Elige quién dibuja (alguien que aún no haya dibujado) y la palabra secreta. */
  private async pickDrawer(g: string, meta: Meta, q: GameQuestion) {
    const players = (await this.store.activePlayers(g)).map((p) => p.id);
    const states = await this.store.allPlayerStates(g);
    const blocked = new Set(
      (
        await Promise.all(
          players.map(async (id) =>
            (await this.modes.blocker(meta, states[id] ?? null, id)) ? id : null,
          ),
        )
      ).filter(Boolean),
    );
    const pool = players.filter((id) => !blocked.has(id) && !meta.drawn.includes(id));
    const candidates = pool.length ? pool : players.filter((id) => !blocked.has(id));
    const drawerId = candidates[randomInt(Math.max(1, candidates.length))] ?? players[0] ?? '';
    const words = (q.config.drawWords ?? []).filter((w) => w.trim());
    const word = words[randomInt(Math.max(1, words.length))] ?? '';
    return { drawerId, word: word.trim() };
  }

  async openQuestion(g: string, i: number) {
    const meta = await this.requireMeta(g);
    const questions = await this.store.quiz(g);
    const q = questions[i];
    if (!q) return;
    const now = Date.now();
    const limitMs = Math.round(q.timeLimit * 1000 * (1 + meta.settings.extraTimePercent / 100));
    const endsAt = now + limitMs;
    const eligible = await this.modes.eligibleCount(g, meta, q);
    const ok = await this.store.transition(g, 'getReady', i, 'question', {
      qStartedAt: now,
      endsAt,
      eligible,
    });
    if (!ok) return;
    this.broadcast(g, {
      phase: 'question',
      qIndex: i,
      question: await this.publicQuestion(g, meta, i),
      endsAt,
    });
    await this.own(g);
    this.schedule(g, endsAt + GAME_LIMITS.answerGraceMs, () => this.closeQuestion(g, i));
    this.startTicker(g, i);
  }

  /**
   * Fin del tiempo de respuesta. Si alguien usó "+10 s", se espera. En la pregunta abierta
   * se pasa a la votación; en las demás, a la revelación.
   */
  async closeQuestion(g: string, i: number) {
    const meta = await this.store.meta(g);
    if (!meta || meta.phase !== 'question' || meta.qIndex !== i) return;
    if (meta.extUntil > Date.now() && meta.eligible > (await this.store.answeredCount(g, i))) {
      // Alguien tiene tiempo extra: se reprograma el cierre
      this.schedule(g, meta.extUntil + GAME_LIMITS.answerGraceMs, () => this.closeQuestion(g, i));
      return;
    }
    const q = (await this.store.quiz(g))[i];
    if (q?.type === 'OPEN_VOTE') return this.startVote(g, i);
    return this.finalize(g, i, 'question');
  }

  /** Pregunta abierta: las respuestas escritas pasan a votación (muestra de hasta 12). */
  private async startVote(g: string, i: number) {
    const answers = await this.store.answers(g, i);
    const entries = Object.entries(answers).filter(([, a]) => (a.a as { t?: string } | null)?.t);
    if (entries.length < 2) return this.finalize(g, i, 'question');
    const sample = entries.sort(() => randomInt(3) - 1).slice(0, MAX_CANDIDATES);
    const map: Record<string, string> = {};
    const candidates = sample.map(([pid, a]) => {
      const id = randomBytes(6).toString('base64url');
      map[id] = pid;
      return { id, text: String((a.a as { t: string }).t) };
    });
    const endsAt = Date.now() + VOTE_SECONDS * 1000;
    const ok = await this.store.transition(g, 'question', i, 'vote', {
      endsAt,
      candJson: JSON.stringify(map),
      candPublic: JSON.stringify(candidates),
    });
    if (!ok) return;
    this.stopTicker(g);
    this.broadcast(g, { phase: 'vote', qIndex: i, endsAt, candidates });
    this.schedule(g, endsAt, () => this.finalize(g, i, 'vote'));
  }

  /** Cierra la pregunta: revela la respuesta, actualiza el modo y el ranking, y entrega resultados. */
  async finalize(g: string, i: number, from: 'question' | 'vote') {
    const ok = await this.store.transition(g, from, i, 'reveal');
    if (!ok) return;
    clearTimeout(this.timers.get(g));
    this.stopTicker(g);

    const [meta, questions] = await Promise.all([this.requireMeta(g), this.store.quiz(g)]);
    const q = questions[i]!;
    const answers = await this.store.answers(g, i);

    // Dibujo: quien dibuja gana 100 puntos por cada acierto (máx. 1.000)
    if (q.type === 'DRAW' && meta.drawerId && isScored(q)) {
      const guessed = Object.values(answers).filter((a) => a.c >= 1).length;
      await this.store.addScore(g, meta.drawerId, Math.min(1000, guessed * 100));
    }
    if (isScored(q)) await this.store.resetMissingStreaks(g, i);

    const mode = await this.modes.afterQuestion(g, meta, q, answers);
    await this.store.recomputeRanks(g);
    const [counts, info, players, votes] = await Promise.all([
      this.store.counts(g, i),
      this.store.qinfo(g, i),
      this.store.allPlayers(g),
      q.type === 'OPEN_VOTE' ? this.store.votes(g, i) : Promise.resolve({}),
    ]);
    const summaries = Object.fromEntries(
      Object.entries(players).map(([id, p]) => [id, { id, nick: p.n, avatar: p.a }]),
    );
    const reveal: RevealData = {
      qIndex: i,
      correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
      acceptedAnswers: q.type === 'TYPE_ANSWER' ? (q.config.accepted ?? []).filter(Boolean) : [],
      explanation: q.explanation,
      distribution: counts,
      answered: Object.keys(answers).length,
      correctCount: info.correct,
      players: meta.eligible,
      extra: buildRevealExtra(q, {
        answers,
        counts,
        players: summaries,
        votes,
        draw: {
          word: meta.drawWord || null,
          drawer: meta.drawerId ? (summaries[meta.drawerId] ?? null) : null,
        },
      }),
    };
    await this.store.setMeta(g, { ...mode.fields, revealJson: JSON.stringify(reveal) });
    this.broadcast(g, { phase: 'reveal', qIndex: i, reveal, modeState: mode.state });

    // Resultados personales: cada instancia los entrega a sus jugadores conectados
    this.ctx.io.serverSideEmit('deliver:results', g, i);
    await this.deliverResults(g, i);

    persistQuestion(this.store, g, i, q).catch((err) =>
      this.ctx.log.error({ err, gameId: g, qIndex: i }, 'No se pudieron guardar las respuestas'),
    );
  }

  /** Botón "Siguiente" del anfitrión. */
  async next(g: string) {
    const meta = await this.requireMeta(g);
    const last = meta.qIndex >= meta.questionCount - 1;
    if (meta.phase === 'reveal') {
      // Fin anticipado según el modo: último superviviente, jefe derrotado, campeón del torneo
      if (last || this.modes.isOver(meta, meta.modeState)) return this.podium(g, 'reveal');
      const leaderboard = await this.store.leaderboard(g, GAME_LIMITS.leaderboardSize);
      const ok = await this.store.transition(g, 'reveal', meta.qIndex, 'leaderboard', {
        lbJson: JSON.stringify(leaderboard),
      });
      if (ok)
        this.broadcast(g, {
          phase: 'leaderboard',
          qIndex: meta.qIndex,
          leaderboard,
          modeState: meta.modeState,
        });
      return;
    }
    if (meta.phase === 'leaderboard')
      return this.getReady(g, meta.qIndex + 1, 'leaderboard', meta.qIndex);
    if (meta.phase === 'podium') return this.finish(g);
    throw new GameError('NOTHING_TO_ADVANCE');
  }

  /** Cierra la pregunta (o la votación) antes de tiempo, o abre ya las respuestas. */
  async skip(g: string) {
    const meta = await this.requireMeta(g);
    if (meta.phase === 'question') {
      await this.store.setMeta(g, { extUntil: '0' });
      return this.closeQuestion(g, meta.qIndex);
    }
    if (meta.phase === 'vote') return this.finalize(g, meta.qIndex, 'vote');
    if (meta.phase === 'getReady') return this.openQuestion(g, meta.qIndex);
    throw new GameError('NOTHING_TO_SKIP');
  }

  /** Si ya respondieron todos los que pueden responder, no hace falta esperar al reloj. */
  async maybeCloseEarly(g: string, i: number, answered: number) {
    const meta = await this.store.meta(g);
    if (meta && meta.phase === 'question' && meta.qIndex === i && answered >= meta.eligible) {
      await this.store.setMeta(g, { extUntil: '0' });
      await this.closeQuestion(g, i);
    }
  }

  /** Votación: si ya votaron todos, se revela. */
  async maybeCloseVote(g: string, i: number, votes: number) {
    const meta = await this.store.meta(g);
    if (meta && meta.phase === 'vote' && meta.qIndex === i && votes >= meta.playerCount) {
      await this.finalize(g, i, 'vote');
    }
  }

  /** Alguien usó "+10 s": la pregunta no se cerrará antes de esa hora. */
  async extendQuestion(g: string, until: number) {
    const meta = await this.store.meta(g);
    if (meta && until > meta.extUntil) await this.store.setMeta(g, { extUntil: String(until) });
  }

  private async podium(g: string, from: GamePhase) {
    const meta = await this.requireMeta(g);
    const [top, questions, states, players] = await Promise.all([
      this.store.leaderboard(g, 5),
      this.store.quiz(g),
      this.store.allPlayerStates(g),
      this.store.allPlayers(g),
    ]);
    // Momentos destacados para la "repetición" final
    const qStats = await Promise.all(
      questions.slice(0, meta.qIndex + 1).map(async (q, i) => {
        const [info, answered] = await Promise.all([
          this.store.qinfo(g, i),
          this.store.answeredCount(g, i),
        ]);
        const fp = info.fastestPid ? players[info.fastestPid] : null;
        return {
          qIndex: i,
          prompt: q.prompt,
          scored: isScored(q),
          answered,
          correctCount: info.correct,
          fastest:
            fp && info.fastestMs !== null ? { nick: fp.n, avatar: fp.a, ms: info.fastestMs } : null,
        };
      }),
    );
    const pStats = Object.entries(players)
      .filter(([, p]) => !p.k)
      .map(([pid, p]) => ({
        nick: p.n,
        avatar: p.a,
        bestStreak: states[pid]?.b ?? 0,
        bestClimb: states[pid]?.bc ?? 0,
        correct: states[pid]?.c ?? 0,
      }));
    const modeState = await this.modes.computeState(g, meta, [], null);
    const podium: PodiumData = {
      top,
      highlights: computeHighlights(qStats, pStats),
      players: meta.playerCount,
      mode: meta.settings.mode,
      // El jefe y el torneo muestran el último estado (victoria/derrota, campeón)
      modeState:
        meta.settings.mode === 'BOSS' || meta.settings.mode === 'TOURNAMENT'
          ? (meta.modeState ?? modeState)
          : modeState,
    };

    const ok = await this.store.transition(g, from, '*', 'podium', {
      podiumJson: JSON.stringify(podium),
      modeJson: JSON.stringify(podium.modeState),
    });
    if (!ok) return;
    this.broadcast(g, {
      phase: 'podium',
      qIndex: meta.qIndex,
      podium,
      modeState: podium.modeState,
    });
    this.ctx.io.serverSideEmit('deliver:final', g);
    await this.deliverFinal(g);
    await this.store.markRunning(g, false);
    this.dropGame(g);
    persistFinal(
      this.store,
      this.ctx.redis,
      g,
      meta.quizId,
      meta.settings.mode,
      meta.settings.teamCount,
    ).catch((err) =>
      this.ctx.log.error({ err, gameId: g }, 'No se pudieron guardar los resultados finales'),
    );
    // El PIN queda libre al cabo de 10 minutos (quien llegue tarde verá "partida terminada")
    await this.store.releasePin(meta.pin, 600);
  }

  private async finish(g: string) {
    const ok = await this.store.transition(g, 'podium', '*', 'ended');
    if (ok) this.ctx.io.to(rooms.all(g)).emit('game:ended');
  }

  /** El anfitrión termina la partida en cualquier momento. */
  async end(g: string) {
    const meta = await this.requireMeta(g);
    if (meta.phase === 'lobby') {
      if (await this.store.transition(g, 'lobby', '*', 'ended')) {
        this.ctx.io.to(rooms.all(g)).emit('game:ended');
        await this.store.releasePin(meta.pin, 60);
        markCancelled(g).catch(() => {});
      }
      return;
    }
    if (meta.phase === 'getReady') await this.store.transition(g, 'getReady', '*', 'reveal');
    if (meta.phase === 'question' || meta.phase === 'vote')
      await this.finalize(g, meta.qIndex, meta.phase);
    if (meta.phase === 'leaderboard') await this.store.transition(g, 'leaderboard', '*', 'reveal');
    if (meta.phase !== 'podium' && meta.phase !== 'ended') await this.podium(g, 'reveal');
    else if (meta.phase === 'podium') await this.finish(g);
  }

  // ───────────────────────── Entrega personal (local) ─────────────────────────

  private buildResult(
    meta: Meta,
    q: GameQuestion | undefined,
    d: Awaited<ReturnType<GameStore['playerResultsData']>>[number],
    teams: Record<string, number>,
  ): PlayerResult {
    const scored = q ? isScored(q) : false;
    const a: StoredAnswer | null = d.answer;
    const timeLimitMs = (q?.timeLimit ?? 20) * 1000;
    const ps: PlayerState | null = d.pstate;
    const result: PlayerResult = {
      qIndex: meta.qIndex,
      answered: !!a,
      correct: !!a && a.c >= 1,
      correctness: a?.c ?? 0,
      points: a?.p ?? 0,
      streakBonus: a?.b ?? 0,
      total: d.total,
      streak: ps?.s ?? 0,
      rank: d.rank ?? meta.playerCount,
      prevRank: d.prevRank,
      players: meta.playerCount,
      messageKey: resultMessageKey({
        scored,
        answered: !!a,
        correctness: a?.c ?? 0,
        streak: ps?.s ?? 0,
        previousStreak: a?.ps ?? 0,
        elapsedMs: a?.t ?? null,
        timeLimitMs,
        rank: d.rank ?? meta.playerCount,
        prevRank: d.prevRank,
      }),
    };
    // Escudo: falló una pregunta puntuable pero conserva la racha que traía
    if (scored && a && !a.c && (a.ps ?? 0) > 0 && (ps?.s ?? 0) === a.ps) {
      result.shieldUsed = true;
      result.messageKey = 'shielded';
    }
    if (q?.type === 'DRAW' && meta.drawerId === d.pid) result.messageKey = 'drawer';

    // Información según el modo
    const state = meta.modeState;
    const team = teams[d.pid];
    if (team !== undefined && state && (state.mode === 'TEAMS' || state.mode === 'TERRITORY')) {
      result.team = { index: team, rank: state.teams.findIndex((t) => t.index === team) + 1 };
    }
    if (meta.settings.mode === 'SURVIVAL' && ps?.l !== undefined) {
      result.lives = ps.l;
      result.eliminated = ps.l <= 0;
      if (
        scored &&
        ps.l <= 0 &&
        state?.mode === 'SURVIVAL' &&
        state.eliminatedNow.some((p) => p.id === d.pid)
      )
        result.messageKey = 'eliminated';
      else if (scored && ps.l > 0 && !result.correct) result.messageKey = 'survived';
    }
    if (meta.settings.mode === 'RACE') {
      const racer = state?.mode === 'RACE' ? state.racers.find((r) => r.id === d.pid) : null;
      result.raceProgress =
        racer?.progress ?? Math.min(1, (ps?.c ?? 0) / Math.max(1, meta.questionCount));
    }
    if (meta.settings.mode === 'BOSS') result.damage = a && a.c > 0 ? Math.round(a.p * 0.6) : 0;
    if (state?.mode === 'TOURNAMENT') {
      const duel = state.matches.find((m) => m.a.id === d.pid || m.b?.id === d.pid);
      const nextDuel = meta.tour?.duels.find((x) => x.a === d.pid || x.b === d.pid);
      const opponent = duel ? (duel.a.id === d.pid ? duel.b : duel.a) : null;
      const won = duel ? duel.winner === d.pid : null;
      result.duel = {
        opponent,
        won,
        next: null,
        out: !nextDuel && !(meta.tour?.champion === d.pid),
      };
      if (duel && scored) result.messageKey = won ? 'duelWon' : 'duelLost';
    }
    return result;
  }

  /** Jugadores conectados a ESTA instancia en una partida, agrupados por playerId. */
  private async localPlayerSockets(g: string) {
    const sockets = await this.ctx.io.local.in(rooms.players(g)).fetchSockets();
    const byPlayer = new Map<string, typeof sockets>();
    for (const s of sockets) {
      const pid = s.data.playerId;
      if (!pid) continue;
      byPlayer.set(pid, [...(byPlayer.get(pid) ?? []), s]);
    }
    return byPlayer;
  }

  async deliverResults(g: string, i: number) {
    const byPlayer = await this.localPlayerSockets(g);
    if (byPlayer.size === 0) return;
    const [meta, questions, teams] = await Promise.all([
      this.requireMeta(g),
      this.store.quiz(g),
      this.store.teamOf(g),
    ]);
    const data = await this.store.playerResultsData(g, i, [...byPlayer.keys()]);
    for (const d of data) {
      const result = this.buildResult(meta, questions[i], d, teams);
      for (const s of byPlayer.get(d.pid) ?? []) s.emit('player:result', result);
    }
  }

  /** Datos personales al empezar cada pregunta: palabra secreta, rival, vidas, power-ups. */
  async deliverMeta(g: string) {
    const byPlayer = await this.localPlayerSockets(g);
    if (byPlayer.size === 0) return;
    const meta = await this.requireMeta(g);
    const players = await this.store.allPlayers(g);
    for (const [pid, sockets] of byPlayer) {
      const payload: Parameters<ServerToClientEvents['player:meta']>[0] = {};
      payload.drawWord = meta.drawerId === pid ? meta.drawWord : null;
      if (meta.tour && !meta.tour.champion) {
        const duel = meta.tour.duels.find((d) => d.a === pid || d.b === pid);
        const oppId = duel ? (duel.a === pid ? duel.b : duel.a) : null;
        const opp = oppId ? players[oppId] : null;
        payload.opponent = opp ? { id: oppId!, nick: opp.n, avatar: opp.a } : null;
        payload.eliminated = !duel;
      }
      const pu = await this.store.powerUps(g, pid);
      if (pu) payload.powerUps = pu.have;
      for (const s of sockets) s.emit('player:meta', payload);
    }
  }

  async deliverFinal(g: string) {
    const byPlayer = await this.localPlayerSockets(g);
    if (byPlayer.size === 0) return;
    const meta = await this.requireMeta(g);
    const [data, teams] = await Promise.all([
      this.store.playerResultsData(g, meta.qIndex, [...byPlayer.keys()]),
      this.store.teamOf(g),
    ]);
    const state = meta.podium?.modeState ?? meta.modeState;
    for (const d of data) {
      const rank = d.rank ?? meta.playerCount;
      const team = teams[d.pid];
      const payload = {
        rank,
        score: d.total,
        players: meta.playerCount,
        messageKey: finalMessageKey(rank, meta.playerCount),
        ...(team !== undefined && state && (state.mode === 'TEAMS' || state.mode === 'TERRITORY')
          ? { team: { index: team, rank: state.teams.findIndex((t) => t.index === team) + 1 } }
          : {}),
      };
      for (const s of byPlayer.get(d.pid) ?? []) s.emit('player:final', payload);
    }
  }
}

/** Hora real de cierre de la pregunta (contando los "+10 s" usados). */
function closeAt(meta: Meta): number {
  return Math.max(meta.endsAt, meta.extUntil) + GAME_LIMITS.answerGraceMs;
}
