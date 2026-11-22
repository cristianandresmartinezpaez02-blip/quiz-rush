// Tipos de la partida en vivo y contrato TIPADO de eventos Socket.IO (cliente ↔ servidor).
// Los mensajes son compactos: solo se envía lo que cambió, nunca el estado completo de 2.000 jugadores.
import type { PointsMode } from '../constants';
import type { QuestionConfig, QuestionMedia } from '../questions/schemas';
import type { QuestionType } from '../questions/types';
import type { DuelView } from './duel';
import type { PowerUp } from './powerups';
import type { AnswerPayload, GameSettings, LiveMode, Reaction } from './settings';

export type GamePhase =
  | 'lobby' // sala de espera
  | 'getReady' // "¡Prepárate!" antes de cada pregunta (en Equipos: tiempo para discutir)
  | 'question' // respuestas abiertas
  | 'vote' // pregunta abierta: votación de las respuestas
  | 'reveal' // respuesta correcta + distribución
  | 'leaderboard' // ranking (o vista del modo) entre preguntas
  | 'podium' // podio final
  | 'ended'; // partida cerrada

/** Pregunta tal como la guarda el servidor (con respuestas). Nunca se envía a los clientes. */
export interface GameQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  timeLimit: number;
  points: PointsMode;
  media: QuestionMedia | null;
  hint: string | null;
  explanation: string | null;
  options: { id: string; text: string; isCorrect: boolean }[];
  config: QuestionConfig & {
    /** Emparejar: id de pareja → token público del elemento derecho (lo genera el servidor) */
    matchTokens?: Record<string, string>;
  };
}

/** Datos específicos de cada tipo que necesita el cliente (nunca incluyen la respuesta). */
export type QuestionExtra =
  | { kind: 'order'; items: { id: string; text: string }[] }
  | { kind: 'match'; left: { id: string; text: string }[]; right: { id: string; text: string }[] }
  | { kind: 'slider'; min: number; max: number; step: number; unit?: string }
  | { kind: 'pin'; imageUrl: string }
  | { kind: 'blanks'; parts: string[] }
  | { kind: 'reveal'; tiles: number }
  | { kind: 'cloud'; maxWords: number }
  | { kind: 'vote' }
  | { kind: 'draw'; wordLength: number; drawer: PlayerSummary | null };

/** Pregunta pública (sin respuestas correctas) para jugadores y pantalla. */
export interface PublicQuestion {
  index: number;
  total: number;
  type: QuestionType;
  prompt: string;
  timeLimit: number;
  points: PointsMode;
  media: QuestionMedia | null;
  options: { id: string; text: string }[];
  multiSelect: boolean;
  hasHint: boolean;
  extra: QuestionExtra | null;
}

export interface PlayerSummary {
  id: string;
  nick: string;
  avatar: string;
}

export interface LeaderboardEntry extends PlayerSummary {
  score: number;
  rank: number;
  /** Puesto en el ranking anterior (para animar subidas y bajadas) */
  prevRank: number | null;
  streak: number;
  /** Supervivencia: vidas restantes */
  lives?: number;
  /** Equipos: índice del equipo */
  team?: number;
}

/** Datos de la revelación específicos de cada tipo de pregunta. */
export type RevealExtra =
  | { kind: 'order'; correct: { id: string; text: string }[]; fullyCorrect: number }
  | { kind: 'match'; pairs: { left: string; right: string }[]; fullyCorrect: number }
  | {
      kind: 'slider';
      correct: number;
      tolerance: number;
      min: number;
      max: number;
      unit?: string;
      histogram: number[];
      average: number | null;
    }
  | {
      kind: 'pin';
      x: number;
      y: number;
      radius: number;
      imageUrl: string;
      taps: [number, number][];
    }
  | { kind: 'blanks'; parts: string[]; answers: string[] }
  | { kind: 'cloud'; words: [string, number][] }
  | { kind: 'vote'; answers: { text: string; nick: string; avatar: string; votes: number }[] }
  | { kind: 'draw'; word: string; drawer: PlayerSummary | null; guessed: number };

export interface RevealData {
  qIndex: number;
  correctOptionIds: string[];
  acceptedAnswers: string[];
  explanation: string | null;
  /** optionId → número de jugadores que la eligieron (o texto normalizado → cuenta) */
  distribution: Record<string, number>;
  answered: number;
  correctCount: number;
  players: number;
  extra?: RevealExtra | null;
}

// ───────────────────────── Estado de los modos ─────────────────────────

export interface TeamStanding {
  index: number;
  /** Puntaje del equipo: media de sus miembros (justo con equipos de distinto tamaño) */
  score: number;
  members: number;
  /** Mejores jugadores del equipo */
  mvps: PlayerSummary[];
}

export interface DuelMatch {
  a: PlayerSummary;
  b: PlayerSummary | null; // null = pasa sin rival (bye)
  winner: string | null;
}

export type ModeState =
  | { mode: 'CLASSIC' }
  | { mode: 'TEAMS'; teams: TeamStanding[] }
  | { mode: 'SURVIVAL'; alive: number; eliminatedNow: PlayerSummary[] }
  | {
      mode: 'RACE';
      racers: (PlayerSummary & { progress: number; vehicle: string; rank: number })[];
    }
  | {
      mode: 'BOSS';
      hp: number;
      maxHp: number;
      lastDamage: number;
      lastHeal: number;
      defeated: boolean;
      topHitters: (PlayerSummary & { damage: number })[];
    }
  | {
      mode: 'TOURNAMENT';
      round: number;
      totalRounds: number;
      matches: DuelMatch[];
      champion: PlayerSummary | null;
      remaining: number;
    }
  | { mode: 'TERRITORY'; cols: number; rows: number; grid: number[]; teams: TeamStanding[] };

/** Resultado personal de una pregunta (solo lo recibe ese jugador). */
export interface PlayerResult {
  qIndex: number;
  answered: boolean;
  correct: boolean;
  /** 0..1 (crédito parcial) */
  correctness: number;
  points: number;
  streakBonus: number;
  total: number;
  streak: number;
  rank: number;
  prevRank: number | null;
  players: number;
  /** Clave del mensaje divertido (messages/*.json → game.messages.<key>) */
  messageKey: ResultMessageKey;
  /** Información según el modo */
  lives?: number;
  eliminated?: boolean;
  team?: { index: number; rank: number };
  raceProgress?: number;
  damage?: number;
  duel?: {
    opponent: PlayerSummary | null;
    won: boolean | null;
    next: PlayerSummary | null;
    out: boolean;
  };
  shieldUsed?: boolean;
}

export type ResultMessageKey =
  | 'unstoppable'
  | 'onFire'
  | 'lightning'
  | 'comeback'
  | 'nice'
  | 'partial'
  | 'almost'
  | 'streakLost'
  | 'missed'
  | 'noAnswer'
  | 'poll'
  | 'eliminated'
  | 'survived'
  | 'duelWon'
  | 'duelLost'
  | 'shielded'
  | 'drawer';

export interface Highlight {
  kind: 'fastest' | 'longestStreak' | 'comeback' | 'hardest' | 'easiest' | 'perfect';
  nick?: string;
  avatar?: string;
  value: number;
  qIndex?: number;
  prompt?: string;
}

export interface PodiumData {
  top: LeaderboardEntry[];
  highlights: Highlight[];
  players: number;
  mode: LiveMode;
  modeState: ModeState | null;
}

/** Estado personal de un jugador en la partida (modo y power-ups). */
export interface PlayerMeta {
  team: number | null;
  lives: number | null;
  eliminated: boolean;
  powerUps: PowerUp[];
  vehicle: string | null;
}

/** Estado completo que recibe quien (re)entra a la partida. */
export interface GameSnapshot {
  gameId: string;
  pin: string;
  phase: GamePhase;
  quizTitle: string;
  /** Tema visual del quiz (fondo de la pantalla de juego) */
  theme: string;
  questionCount: number;
  qIndex: number;
  locked: boolean;
  settings: GameSettings;
  playerCount: number;
  question: PublicQuestion | null;
  /** Hora del servidor (ms) en que termina la fase con tiempo (para sincronizar relojes) */
  endsAt: number | null;
  serverNow: number;
  reveal: RevealData | null;
  leaderboard: LeaderboardEntry[] | null;
  podium: PodiumData | null;
  modeState: ModeState | null;
  /** Votación (pregunta abierta) */
  candidates: VoteCandidate[] | null;
  /** Dibujo: trazos ya dibujados (para quien entra a mitad) */
  strokes: Stroke[] | null;
}

export interface HostSnapshot extends GameSnapshot {
  players: (PlayerSummary & { team: number | null })[];
  spectatorKey: string;
  answered: number;
}

export interface PlayerSnapshot extends GameSnapshot {
  me: PlayerSummary & { score: number; rank: number | null } & PlayerMeta;
  /** Ya respondió la pregunta actual */
  answeredCurrent: boolean;
  lastResult: PlayerResult | null;
  /** Si me toca dibujar: la palabra secreta */
  drawWord: string | null;
}

export interface VoteCandidate {
  id: string;
  text: string;
}

/** Trazo del dibujo: puntos en coordenadas 0–1000 (independientes del tamaño de pantalla). */
export interface Stroke {
  c: string; // color
  w: number; // grosor
  p: number[]; // [x1, y1, x2, y2, …]
}

export type PowerUpResult =
  | { type: 'fifty'; hide: string[] }
  | { type: 'hint'; hint: string }
  | { type: 'time'; endsAt: number }
  | { type: 'double' | 'shield' | 'second' };

export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

/** Eventos que el servidor envía. */
export interface ServerToClientEvents {
  /** Cambio de fase con los datos mínimos de esa fase */
  phase: (data: {
    phase: GamePhase;
    qIndex: number;
    question?: PublicQuestion | null;
    endsAt?: number | null;
    serverNow: number;
    reveal?: RevealData | null;
    leaderboard?: LeaderboardEntry[] | null;
    podium?: PodiumData | null;
    modeState?: ModeState | null;
    candidates?: VoteCandidate[] | null;
  }) => void;
  /** Sala de espera: alguien entró o salió (solo a anfitrión/pantalla) */
  'lobby:player': (data: {
    joined?: PlayerSummary & { team: number | null };
    left?: string;
    count: number;
  }) => void;
  /** Reparto de equipos (al empezar en modo Equipos/Conquista) */
  'lobby:teams': (data: Record<string, number>) => void;
  /** Número de respuestas recibidas (agrupado cada 500 ms) */
  'answers:count': (data: { qIndex: number; answered: number; players: number }) => void;
  /** Nube de palabras en vivo (agrupada) */
  'cloud:update': (data: { qIndex: number; words: [string, number][] }) => void;
  /** Reacciones agrupadas: emoji → cantidad */
  reactions: (data: Partial<Record<Reaction, number>>) => void;
  /** Resultado personal de la pregunta */
  'player:result': (data: PlayerResult) => void;
  /** Estado personal (vidas, equipo, rival del torneo…) al empezar cada pregunta */
  'player:meta': (
    data: Partial<PlayerMeta> & { opponent?: PlayerSummary | null; drawWord?: string | null },
  ) => void;
  /** Resultado final personal */
  'player:final': (data: {
    rank: number;
    score: number;
    players: number;
    messageKey: ResultMessageKey;
    team?: { index: number; rank: number };
  }) => void;
  /** Dibujo en vivo */
  'draw:stroke': (data: { qIndex: number; stroke: Stroke }) => void;
  'draw:clear': (data: { qIndex: number }) => void;
  /** Duelo: estado personal (yo / rival) */
  'duel:state': (data: DuelView) => void;
  /** Duelo: te congelaron hasta esa hora del servidor */
  'duel:frozen': (data: { until: number }) => void;
  'player:kicked': () => void;
  'room:locked': (data: { locked: boolean }) => void;
  /** Cambio de ajustes en la sala de espera (modo, vidas, equipos…) */
  'room:settings': (data: GameSettings) => void;
  'game:ended': () => void;
}

/** Eventos que envían los clientes. */
export interface ClientToServerEvents {
  'host:join': (data: { gameId: string; authToken: string }, ack: Ack<HostSnapshot>) => void;
  'host:start': (ack: Ack<null>) => void;
  /** Avanza a la siguiente fase (revelar → ranking → siguiente pregunta → podio) */
  'host:next': (ack: Ack<null>) => void;
  /** Cierra la pregunta antes de tiempo */
  'host:skip': (ack: Ack<null>) => void;
  'host:kick': (data: { playerId: string }, ack: Ack<null>) => void;
  'host:lock': (data: { locked: boolean }, ack: Ack<null>) => void;
  'host:settings': (data: Partial<GameSettings>, ack: Ack<GameSettings>) => void;
  'host:end': (ack: Ack<null>) => void;
  'spectator:join': (data: { gameId: string; key: string }, ack: Ack<HostSnapshot>) => void;
  /** Comprueba un PIN antes de pedir el apodo */
  'player:check': (
    data: { pin: string },
    ack: Ack<{ quizTitle: string; theme: string; started: boolean }>,
  ) => void;
  'player:join': (
    data: { pin: string; nickname: string; avatar: string; authToken?: string },
    ack: Ack<{
      playerId: string;
      reconnectToken: string;
      gameId: string;
      snapshot: PlayerSnapshot;
    }>,
  ) => void;
  'player:resume': (
    data: { gameId: string; reconnectToken: string },
    ack: Ack<PlayerSnapshot>,
  ) => void;
  /** `retry` = la segunda oportunidad salvó una respuesta incorrecta; `correct` en el dibujo */
  'player:answer': (
    data: AnswerPayload,
    ack: Ack<{ received: boolean; retry?: boolean; correct?: boolean }>,
  ) => void;
  'player:vote': (
    data: { qIndex: number; candidateId: string },
    ack: Ack<{ received: true }>,
  ) => void;
  'player:powerup': (data: { qIndex: number; type: PowerUp }, ack: Ack<PowerUpResult>) => void;
  'draw:stroke': (data: { qIndex: number; stroke: Stroke }) => void;
  'draw:clear': (data: { qIndex: number }) => void;
  'player:react': (data: { emoji: string }) => void;
  /** Duelo: buscar rival (o unirse con el código de un amigo) */
  'duel:find': (
    data: { authToken: string; code?: string },
    ack: Ack<{ status: 'searching' | 'matched' }>,
  ) => void;
  /** Duelo privado: crea un código para compartir con un amigo */
  'duel:host': (data: { authToken: string }, ack: Ack<{ code: string }>) => void;
  'duel:cancel': (ack: Ack<null>) => void;
  'duel:answer': (
    data: { duelId: string; qIndex: number; answer: Omit<AnswerPayload, 'qIndex'> },
    ack: Ack<{ correct: boolean; points: number }>,
  ) => void;
  'duel:freeze': (data: { duelId: string; qIndex: number }, ack: Ack<{ until: number }>) => void;
  'duel:resume': (data: { duelId: string; authToken: string }, ack: Ack<DuelView>) => void;
  'player:leave': () => void;
  'ping:rt': (ack?: (t: number) => void) => void;
}
