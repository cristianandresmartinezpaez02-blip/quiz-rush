// Ajustes de una partida en vivo y validación de los datos que llegan por el socket.
import { z } from 'zod';
import { containsProfanity } from '../moderation/profanity';

export const GAME_LIMITS = {
  /** Máximo de jugadores por sala (requisito de escalabilidad: 2.000) */
  maxPlayers: 2000,
  nickname: { min: 2, max: 16 },
  /** Segundos de "¡Prepárate!" antes de abrir cada pregunta */
  getReadySeconds: 3,
  /** Margen para respuestas que llegan justo al final (latencia de red), en ms */
  answerGraceMs: 300,
  /** Cada cuánto se envía al anfitrión el contador de respuestas (salas grandes) */
  answerCountIntervalMs: 500,
  /** Una reacción cada X ms por jugador */
  reactionCooldownMs: 1500,
  /** Cada cuánto se agrupan las reacciones antes de enviarlas a la pantalla */
  reactionBatchMs: 300,
  /** Tamaño del ranking que se muestra entre preguntas */
  leaderboardSize: 10,
} as const;

/** Emojis de reacción permitidos (lista cerrada: nada de texto libre). */
export const REACTIONS = ['🔥', '😂', '😮', '👏', '💖', '🤯', '😭', '🎉'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** Avatares que el jugador elige al entrar (el editor de avatares llega en la Fase 5). */
export const PLAYER_AVATARS = [
  '🦊',
  '🐼',
  '🐙',
  '🦖',
  '🐯',
  '🐸',
  '🦄',
  '🐧',
  '🦁',
  '🐨',
  '🐵',
  '🦉',
  '🐳',
  '🦋',
  '🐲',
  '🐝',
] as const;

/** Modos de juego en vivo. */
export const LIVE_MODES = [
  'CLASSIC',
  'TEAMS',
  'SURVIVAL',
  'RACE',
  'BOSS',
  'TOURNAMENT',
  'TERRITORY',
] as const;
export type LiveMode = (typeof LIVE_MODES)[number];

/** Modos que reparten a los jugadores en equipos. */
export const TEAM_MODES: readonly LiveMode[] = ['TEAMS', 'TERRITORY'];

export const MODE_EMOJI: Record<LiveMode, string> = {
  CLASSIC: '⚡',
  TEAMS: '🤝',
  SURVIVAL: '❤️',
  RACE: '🏎️',
  BOSS: '🐉',
  TOURNAMENT: '⚔️',
  TERRITORY: '🗺️',
};

/** Equipos: color + mascota (el nombre visible se traduce: game.teams.<id>). */
export const TEAMS = [
  { id: 'fox', color: '#ff7a1a', mascot: '🦊' },
  { id: 'shark', color: '#22b8ee', mascot: '🦈' },
  { id: 'frog', color: '#7ed321', mascot: '🐸' },
  { id: 'unicorn', color: '#d946ef', mascot: '🦄' },
] as const;

/** Vehículos de la carrera (se asigna uno a cada jugador según su avatar). */
export const RACE_VEHICLES = ['🏎️', '🚀', '🛸', '🚲', '🛹', '🐎', '🐆', '🦅'] as const;

export const gameSettingsSchema = z.object({
  /** Modo de juego */
  mode: z.enum(LIVE_MODES).default('CLASSIC'),
  /** Número de equipos (modos Equipos y Conquista) */
  teamCount: z.number().int().min(2).max(TEAMS.length).default(2),
  /** Segundos para discutir en equipo antes de abrir las respuestas (modo Equipos) */
  teamTalkSeconds: z.number().int().min(0).max(30).default(10),
  /** Vidas iniciales (modo Supervivencia) */
  lives: z.number().int().min(1).max(5).default(3),
  /** Cada jugador recibe 3 power-ups al azar para usar una vez */
  powerUps: z.boolean().default(true),
  /** Modo "sin velocidad": el puntaje depende solo de acertar (profesores) */
  speedEnabled: z.boolean().default(true),
  /** Mostrar enunciado y opciones también en el celular (accesibilidad; si no, solo formas) */
  showQuestionOnDevices: z.boolean().default(true),
  /** Tiempo extra para todas las preguntas, en % (accesibilidad) */
  extraTimePercent: z.number().int().min(0).max(100).default(0),
  /** Permitir entrar con la partida ya empezada (con 0 puntos) */
  allowLateJoin: z.boolean().default(true),
  maxPlayers: z.number().int().min(2).max(GAME_LIMITS.maxPlayers).default(GAME_LIMITS.maxPlayers),
});
export type GameSettings = z.infer<typeof gameSettingsSchema>;

export const createGameSchema = z.object({
  quizId: z.string().min(1).max(64),
  settings: gameSettingsSchema.partial().default({}),
});

export const nicknameSchema = z
  .string()
  .trim()
  .min(GAME_LIMITS.nickname.min)
  .max(GAME_LIMITS.nickname.max)
  .regex(/^[\p{Letter}\p{Number} _.-]+$/u, 'NICK_CHARS')
  .refine((v) => !containsProfanity(v, { strict: true }), 'OFFENSIVE');

export const joinPayloadSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
  nickname: nicknameSchema,
  avatar: z.enum(PLAYER_AVATARS),
  /** Token de sesión (si el jugador tiene cuenta) para vincular la partida a su perfil */
  authToken: z.string().max(4096).optional(),
});

/** Respuesta de un jugador. Cada tipo de pregunta usa su campo. */
export const answerPayloadSchema = z.object({
  qIndex: z.number().int().min(0).max(200),
  /** Ids de opción elegidos (opción múltiple, verdadero/falso, encuesta, audio, imagen revelada) */
  optionIds: z.array(z.string().max(64)).max(8).optional(),
  /** Texto escrito (respuesta escrita, pregunta abierta, adivinar el dibujo) */
  text: z.string().max(120).optional(),
  /** Ordenar: ids en el orden elegido */
  order: z.array(z.string().max(64)).max(8).optional(),
  /** Emparejar: id del elemento izquierdo → token del elemento derecho */
  pairs: z.record(z.string().max(64), z.string().max(64)).optional(),
  /** Deslizador: valor elegido */
  value: z.number().finite().optional(),
  /** Pin en imagen: punto tocado en % (0–100) */
  point: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).optional(),
  /** Completar espacios: una respuesta por hueco */
  blanks: z.array(z.string().max(80)).max(5).optional(),
  /** Nube de palabras */
  words: z.array(z.string().max(30)).max(5).optional(),
});
export type AnswerPayload = z.infer<typeof answerPayloadSchema>;

/** Genera un PIN de 6 dígitos (sin empezar por 0 para que no se pierda al copiarlo). */
export function generatePin(random: () => number = Math.random): string {
  return String(100000 + Math.floor(random() * 900000));
}
