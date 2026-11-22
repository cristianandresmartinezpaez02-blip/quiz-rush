// Lógica PURA de los modos de juego (sin Redis ni sockets): fácil de probar.
import type { DuelMatch, PlayerSummary, TeamStanding } from './types';

/** Generador pseudoaleatorio determinista (misma semilla → mismo resultado). */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ───────────────────────── Equipos ─────────────────────────

/** Reparte jugadores en equipos equilibrados (orden aleatorio, por turnos). */
export function assignTeams(
  playerIds: string[],
  teamCount: number,
  random: () => number,
): Record<string, number> {
  const out: Record<string, number> = {};
  shuffle(playerIds, random).forEach((id, i) => (out[id] = i % teamCount));
  return out;
}

/** Equipo con menos miembros (para quien entra con la partida empezada). */
export function smallestTeam(teamOf: Record<string, number>, teamCount: number): number {
  const counts = Array.from({ length: teamCount }, () => 0);
  Object.values(teamOf).forEach((t) => counts[t]!++);
  return counts.indexOf(Math.min(...counts));
}

/**
 * Clasificación de equipos. El puntaje es la MEDIA de sus miembros: un equipo pequeño
 * no está en desventaja frente a uno grande.
 */
export function teamStandings(
  teamOf: Record<string, number>,
  scores: Record<string, number>,
  players: Record<string, PlayerSummary>,
  teamCount: number,
): TeamStanding[] {
  const teams: TeamStanding[] = Array.from({ length: teamCount }, (_, index) => ({
    index,
    score: 0,
    members: 0,
    mvps: [],
  }));
  const totals = Array.from({ length: teamCount }, () => 0);
  const byTeam: string[][] = Array.from({ length: teamCount }, () => []);
  for (const [pid, t] of Object.entries(teamOf)) {
    if (!players[pid] || t >= teamCount) continue;
    teams[t]!.members++;
    totals[t]! += scores[pid] ?? 0;
    byTeam[t]!.push(pid);
  }
  teams.forEach((team, t) => {
    team.score = team.members ? Math.round(totals[t]! / team.members) : 0;
    team.mvps = byTeam[t]!.sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
      .slice(0, 3)
      .map((pid) => players[pid]!);
  });
  return teams.sort((a, b) => b.score - a.score);
}

// ───────────────────────── Supervivencia ─────────────────────────

/** Tras una pregunta puntuable: quien falla o no responde pierde una vida. */
export function applySurvival(
  lives: Record<string, number>,
  correct: Record<string, boolean>,
): { lives: Record<string, number>; eliminated: string[] } {
  const next: Record<string, number> = { ...lives };
  const eliminated: string[] = [];
  for (const [pid, l] of Object.entries(lives)) {
    if (l <= 0 || correct[pid]) continue;
    next[pid] = l - 1;
    if (next[pid] === 0) eliminated.push(pid);
  }
  return { lives: next, eliminated };
}

// ───────────────────────── Carrera ─────────────────────────

/** Avance en la pista (0..1) según los aciertos sobre el total de preguntas puntuables. */
export function raceProgress(correctCount: number, scoredQuestions: number): number {
  if (scoredQuestions <= 0) return 0;
  return Math.max(0, Math.min(1, correctCount / scoredQuestions));
}

// ───────────────────────── Jefe ─────────────────────────

/** Vida inicial del jefe: alcanzable si el grupo acierta ~55 % de las veces. */
export function bossMaxHp(players: number, scoredQuestions: number): number {
  return Math.max(2000, Math.round(players * scoredQuestions * 1000 * 0.55 * 0.6));
}

/** Daño (puntos de los aciertos × 0,6) y curación (cada fallo cura 120) de una pregunta. */
export function bossRound(pointsOfCorrect: number[], wrongCount: number) {
  const damage = Math.round(pointsOfCorrect.reduce((a, b) => a + b, 0) * 0.6);
  const heal = wrongCount * 120;
  return { damage, heal };
}

// ───────────────────────── Torneo ─────────────────────────

export interface Duel {
  a: string;
  b: string | null;
  winner: string | null;
}

/** Empareja jugadores para una ronda; si son impares, el último pasa sin rival. */
export function pairUp(ids: string[]): Duel[] {
  const duels: Duel[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const b = ids[i + 1] ?? null;
    duels.push({ a: ids[i]!, b, winner: b ? null : ids[i]! });
  }
  return duels;
}

/** Resuelve los duelos de una pregunta: gana quien hizo más puntos; empate → el más rápido. */
export function resolveDuels(
  duels: Duel[],
  result: Record<string, { points: number; ms: number | null } | undefined>,
): Duel[] {
  return duels.map((d) => {
    if (!d.b) return d;
    const ra = result[d.a];
    const rb = result[d.b];
    const pa = ra?.points ?? -1;
    const pb = rb?.points ?? -1;
    let winner: string;
    if (pa !== pb) winner = pa > pb ? d.a : d.b;
    else winner = (ra?.ms ?? Infinity) <= (rb?.ms ?? Infinity) ? d.a : d.b;
    return { ...d, winner };
  });
}

export function totalRounds(players: number): number {
  return players <= 1 ? 0 : Math.ceil(Math.log2(players));
}

export function toDuelMatches(duels: Duel[], players: Record<string, PlayerSummary>): DuelMatch[] {
  return duels.map((d) => ({ a: players[d.a]!, b: d.b ? players[d.b]! : null, winner: d.winner }));
}

// ───────────────────────── Conquista de territorio ─────────────────────────

export const TERRITORY = { cols: 12, rows: 7 } as const;

/** Esquinas/lados donde empieza cada equipo. */
const BASES = [
  [0, 0],
  [1, 1],
  [1, 0],
  [0, 1],
] as const;

/**
 * Reparte las casillas del mapa entre los equipos en proporción a su puntaje.
 * Cada equipo crece desde su base, así el mapa forma "territorios" continuos.
 * Devuelve el índice del equipo de cada casilla (-1 = sin dueño).
 */
export function territoryGrid(
  scores: number[],
  cols: number = TERRITORY.cols,
  rows: number = TERRITORY.rows,
): number[] {
  const cells = cols * rows;
  const total = scores.reduce((a, b) => a + Math.max(0, b), 0);
  const grid = Array.from({ length: cells }, () => -1);
  if (total <= 0) return grid;

  // Cuántas casillas le tocan a cada equipo (método del mayor resto)
  const exact = scores.map((s) => (Math.max(0, s) / total) * cells);
  const target = exact.map(Math.floor);
  let left = cells - target.reduce((a, b) => a + b, 0);
  exact
    .map((e, i) => ({ i, rest: e - Math.floor(e) }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(({ i }) => {
      if (left > 0 && scores[i]! > 0) {
        target[i]!++;
        left--;
      }
    });

  // Cada equipo toma las casillas libres más cercanas a su base, por turnos
  const dist = (cell: number, team: number) => {
    const [bx, by] = BASES[team % BASES.length]!;
    const x = cell % cols;
    const y = Math.floor(cell / cols);
    return Math.hypot(x - bx * (cols - 1), y - by * (rows - 1));
  };
  const queues = scores.map((_, t) =>
    Array.from({ length: cells }, (_, c) => c).sort((a, b) => dist(a, t) - dist(b, t)),
  );
  const assigned = scores.map(() => 0);
  let progress = true;
  while (progress) {
    progress = false;
    for (let t = 0; t < scores.length; t++) {
      if (assigned[t]! >= target[t]!) continue;
      const q = queues[t]!;
      while (q.length && grid[q[0]!] !== -1) q.shift();
      const cell = q.shift();
      if (cell === undefined) continue;
      grid[cell] = t;
      assigned[t]!++;
      progress = true;
    }
  }
  return grid;
}
