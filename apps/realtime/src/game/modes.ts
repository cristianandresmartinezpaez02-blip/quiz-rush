// Modos de juego en el servidor: preparación al empezar, actualización tras cada pregunta
// y condiciones de fin. La lógica de cálculo es pura y está probada en packages/shared.
import { randomInt } from 'node:crypto';
import {
  applySurvival,
  assignTeams,
  bossMaxHp,
  bossRound,
  dealPowerUps,
  isScored,
  pairUp,
  raceProgress,
  RACE_VEHICLES,
  resolveDuels,
  seededRandom,
  smallestTeam,
  TEAM_MODES,
  teamStandings,
  territoryGrid,
  TERRITORY,
  toDuelMatches,
  totalRounds,
  type GameQuestion,
  type ModeState,
  type PlayerSummary,
  type TeamStanding,
} from '@quiz-rush/shared';
import type {
  GameStore,
  Meta,
  PlayerState,
  PowerUpState,
  StoredAnswer,
  StoredPlayer,
  TourState,
} from './store';

const freshPowerUps = (): PowerUpState => ({
  have: dealPowerUps(),
  dbl: -1,
  tx: -1,
  sc: -1,
  sh: false,
});

/** Vehículo de la carrera según el avatar (estable durante la partida). */
export function vehicleFor(avatar: string): string {
  const code = [...avatar].reduce((a, c) => a + (c.codePointAt(0) ?? 0), 0);
  return RACE_VEHICLES[code % RACE_VEHICLES.length]!;
}

const summary = (id: string, p: StoredPlayer): PlayerSummary => ({ id, nick: p.n, avatar: p.a });

export class ModeRunner {
  constructor(private store: GameStore) {}

  private async activePlayers(g: string) {
    const all = await this.store.allPlayers(g);
    return Object.fromEntries(Object.entries(all).filter(([, p]) => !p.k)) as Record<
      string,
      StoredPlayer
    >;
  }

  /** Preparación al empezar: equipos, vidas, power-ups, vida del jefe o llaves del torneo. */
  async setup(g: string, meta: Meta, questions: GameQuestion[]): Promise<Record<string, string>> {
    const players = await this.activePlayers(g);
    const ids = Object.keys(players);
    const { mode } = meta.settings;
    const fields: Record<string, string> = {};

    // Power-ups (o ninguno si el anfitrión los desactivó)
    await this.store.setAllPowerUps(
      g,
      meta.settings.powerUps ? Object.fromEntries(ids.map((id) => [id, freshPowerUps()])) : {},
    );

    if (TEAM_MODES.includes(mode)) {
      await this.store.setTeams(g, assignTeams(ids, meta.settings.teamCount, seededRandom(g)));
    }
    if (mode === 'SURVIVAL') {
      const states = await this.store.allPlayerStates(g);
      await this.store.setPlayerStates(
        g,
        Object.fromEntries(
          ids.map((id) => [
            id,
            { ...(states[id] ?? { s: 0, b: 0, c: 0, a: 0, bc: 0 }), l: meta.settings.lives },
          ]),
        ),
      );
    }
    if (mode === 'BOSS') {
      const hp = bossMaxHp(ids.length, questions.filter(isScored).length);
      fields.bossHp = String(hp);
      fields.bossMax = String(hp);
    }
    if (mode === 'TOURNAMENT') {
      const order = [...ids].sort(() => randomInt(3) - 1);
      const tour: TourState = {
        round: 0,
        totalRounds: totalRounds(ids.length),
        duels: pairUp(order),
        champion: null,
      };
      fields.tourJson = JSON.stringify(tour);
    }
    const state = await this.computeState(
      g,
      {
        ...meta,
        bossHp: Number(fields.bossHp ?? 0),
        bossMax: Number(fields.bossMax ?? 0),
        tour: fields.tourJson ? JSON.parse(fields.tourJson) : null,
      },
      [],
      null,
    );
    fields.modeJson = JSON.stringify(state);
    return fields;
  }

  /** Jugador que entra con la partida empezada: equipo más pequeño, vidas y power-ups. */
  async onLateJoin(g: string, meta: Meta, pid: string) {
    if (meta.phase === 'lobby') return;
    if (meta.settings.powerUps) await this.store.setPowerUps(g, pid, freshPowerUps());
    if (TEAM_MODES.includes(meta.settings.mode)) {
      await this.store.setTeam(
        g,
        pid,
        smallestTeam(await this.store.teamOf(g), meta.settings.teamCount),
      );
    }
    if (meta.settings.mode === 'SURVIVAL') {
      // Quien llega tarde entra con una sola vida
      await this.store.setPlayerStates(g, { [pid]: { s: 0, b: 0, c: 0, a: 0, bc: 0, l: 1 } });
    }
  }

  /** ¿Puede este jugador responder? (eliminados en Supervivencia o en el Torneo, no). */
  async blocker(meta: Meta, ps: PlayerState | null, pid: string): Promise<string | null> {
    if (meta.settings.mode === 'SURVIVAL' && ps?.l !== undefined && ps.l <= 0) return 'ELIMINATED';
    if (meta.settings.mode === 'TOURNAMENT' && meta.tour && !meta.tour.champion) {
      const inRound = meta.tour.duels.some((d) => d.a === pid || d.b === pid);
      if (!inRound) return 'ELIMINATED';
    }
    return null;
  }

  /** Cuántos jugadores pueden responder la pregunta (para cerrarla antes si ya respondieron todos). */
  async eligibleCount(g: string, meta: Meta, q: GameQuestion): Promise<number> {
    let count = meta.playerCount;
    if (meta.settings.mode === 'SURVIVAL') {
      const states = await this.store.allPlayerStates(g);
      count = Object.values(states).filter((s) => (s.l ?? 1) > 0).length;
    } else if (meta.settings.mode === 'TOURNAMENT' && meta.tour && !meta.tour.champion) {
      count = meta.tour.duels.reduce((n, d) => n + (d.b ? 2 : 1), 0);
    }
    if (q.type === 'DRAW' && meta.drawerId) count -= 1;
    return Math.max(1, count);
  }

  /**
   * Actualiza el modo tras cerrar una pregunta. Devuelve los campos de meta a guardar
   * y el estado del modo para la revelación.
   */
  async afterQuestion(
    g: string,
    meta: Meta,
    q: GameQuestion,
    answers: Record<string, StoredAnswer>,
  ) {
    const fields: Record<string, string> = {};
    const mode = meta.settings.mode;
    let eliminatedNow: string[] = [];
    let next = { ...meta };

    if (mode === 'SURVIVAL' && isScored(q)) {
      const states = await this.store.allPlayerStates(g);
      const lives = Object.fromEntries(Object.entries(states).map(([id, s]) => [id, s.l ?? 0]));
      const correct = Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.c >= 1]));
      const r = applySurvival(lives, correct);
      eliminatedNow = r.eliminated;
      await this.store.setPlayerStates(
        g,
        Object.fromEntries(
          Object.entries(states).map(([id, s]) => [id, { ...s, l: r.lives[id] ?? 0 }]),
        ),
      );
    }

    if (mode === 'BOSS' && isScored(q)) {
      const pointsOfCorrect = Object.values(answers)
        .filter((a) => a.c > 0)
        .map((a) => a.p);
      const wrong = meta.eligible - pointsOfCorrect.length;
      const { damage, heal } = bossRound(pointsOfCorrect, Math.max(0, wrong));
      const afterHit = Math.max(0, meta.bossHp - damage);
      // Solo se cura si sigue vivo, y nunca por encima de su vida máxima
      const hp = afterHit > 0 ? Math.min(meta.bossMax, afterHit + heal) : 0;
      fields.bossHp = String(hp);
      // Se muestra lo que de verdad pasó (sin daño "sobrante" ni curación por encima del máximo)
      fields.lastDamage = String(meta.bossHp - afterHit);
      fields.lastHeal = String(hp - afterHit);
      next = { ...next, bossHp: hp };
    }

    if (mode === 'TOURNAMENT' && meta.tour && !meta.tour.champion && isScored(q)) {
      const resolved = resolveDuels(
        meta.tour.duels,
        Object.fromEntries(
          Object.entries(answers).map(([id, a]) => [id, { points: a.p, ms: a.t }]),
        ),
      );
      const winners = resolved.map((d) => d.winner!).filter(Boolean);
      const tour: TourState =
        winners.length <= 1
          ? { ...meta.tour, duels: resolved, champion: winners[0] ?? null }
          : {
              round: meta.tour.round + 1,
              totalRounds: meta.tour.totalRounds,
              duels: pairUp(winners),
              champion: null,
            };
      // Para la revelación se muestran los duelos ya resueltos de esta ronda
      fields.tourJson = JSON.stringify(tour);
      fields.lastDuelsJson = JSON.stringify(resolved);
      next = { ...next, tour };
    }

    const state = await this.computeState(
      g,
      next,
      eliminatedNow,
      fields.lastDuelsJson ? JSON.parse(fields.lastDuelsJson) : null,
      {
        damage: Number(fields.lastDamage ?? 0),
        heal: Number(fields.lastHeal ?? 0),
        answers,
      },
    );
    fields.modeJson = JSON.stringify(state);
    return { fields, state, eliminatedNow };
  }

  /** Estado visible del modo (clasificación de equipos, pista, jefe, llaves, mapa…). */
  async computeState(
    g: string,
    meta: Pick<Meta, 'settings' | 'bossHp' | 'bossMax' | 'tour' | 'questionCount'> & Partial<Meta>,
    eliminatedNow: string[],
    shownDuels: TourState['duels'] | null,
    round?: { damage: number; heal: number; answers: Record<string, StoredAnswer> },
  ): Promise<ModeState> {
    const mode = meta.settings.mode;
    if (mode === 'CLASSIC') return { mode };
    const [stored, scores] = await Promise.all([this.activePlayers(g), this.store.allScores(g)]);
    const players = Object.fromEntries(
      Object.entries(stored).map(([id, p]) => [id, summary(id, p)]),
    );
    const scoreOf = Object.fromEntries(scores.map((s) => [s.pid, s.score]));

    if (mode === 'TEAMS' || mode === 'TERRITORY') {
      const teams: TeamStanding[] = teamStandings(
        await this.store.teamOf(g),
        scoreOf,
        players,
        meta.settings.teamCount,
      );
      if (mode === 'TEAMS') return { mode, teams };
      const byIndex = Array.from(
        { length: meta.settings.teamCount },
        (_, i) => teams.find((t) => t.index === i)?.score ?? 0,
      );
      return {
        mode,
        cols: TERRITORY.cols,
        rows: TERRITORY.rows,
        grid: territoryGrid(byIndex),
        teams,
      };
    }
    if (mode === 'SURVIVAL') {
      const states = await this.store.allPlayerStates(g);
      return {
        mode,
        alive: Object.entries(states).filter(([id, s]) => players[id] && (s.l ?? 0) > 0).length,
        eliminatedNow: eliminatedNow.map((id) => players[id]!).filter(Boolean),
      };
    }
    if (mode === 'RACE') {
      const states = await this.store.allPlayerStates(g);
      const scored = (await this.store.quiz(g as string)).filter(isScored).length;
      return {
        mode,
        racers: scores.slice(0, 10).flatMap((s, i) =>
          players[s.pid]
            ? [
                {
                  ...players[s.pid]!,
                  progress: raceProgress(states[s.pid]?.c ?? 0, scored),
                  vehicle: vehicleFor(players[s.pid]!.avatar),
                  rank: i + 1,
                },
              ]
            : [],
        ),
      };
    }
    if (mode === 'BOSS') {
      // Quienes más daño hicieron en la última pregunta
      const hitters = round
        ? Object.entries(round.answers)
            .filter(([id, a]) => a.c > 0 && players[id])
            .map(([id, a]) => ({ ...players[id]!, damage: Math.round(a.p * 0.6) }))
            .sort((a, b) => b.damage - a.damage)
            .slice(0, 5)
        : [];
      return {
        mode,
        hp: meta.bossHp,
        maxHp: meta.bossMax,
        lastDamage: round?.damage ?? 0,
        lastHeal: round?.heal ?? 0,
        defeated: meta.bossHp <= 0,
        topHitters: hitters,
      };
    }
    // TOURNAMENT
    const tour = meta.tour;
    const duels = shownDuels ?? tour?.duels ?? [];
    const remaining = tour?.champion
      ? 1
      : (tour?.duels.reduce((n, d) => n + (d.b ? 2 : 1), 0) ?? 0);
    return {
      mode: 'TOURNAMENT',
      round: shownDuels
        ? tour?.champion
          ? tour.round
          : (tour?.round ?? 1) - 1
        : (tour?.round ?? 0),
      totalRounds: tour?.totalRounds ?? 0,
      // En salas enormes solo se envían los 16 primeros duelos (mensajes pequeños)
      matches: toDuelMatches(duels.slice(0, 16), players),
      champion: tour?.champion ? (players[tour.champion] ?? null) : null,
      remaining,
    };
  }

  /** ¿Terminó la partida por el modo? (último superviviente, jefe derrotado, campeón). */
  isOver(meta: Meta, state: ModeState | null): boolean {
    if (!state) return false;
    if (state.mode === 'SURVIVAL')
      return meta.playerCount > 1 ? state.alive <= 1 : state.alive === 0;
    if (state.mode === 'BOSS') return state.defeated;
    if (state.mode === 'TOURNAMENT') return !!state.champion;
    return false;
  }
}
