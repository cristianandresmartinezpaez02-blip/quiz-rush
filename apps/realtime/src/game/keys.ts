// Claves de Redis de una partida. El estado vive en Redis (no en memoria del servidor):
// si una instancia se cae, cualquier otra puede retomar la partida.
//
// `{gameId}` es una "hash tag": todas las claves de una partida caen en el mismo nodo de
// Redis Cluster, así los scripts Lua que tocan varias claves siguen funcionando al escalar.

export const keys = {
  /** Hash: fase, pregunta actual, tiempos, ajustes, PIN… */
  meta: (g: string) => `g:{${g}}:meta`,
  /** String JSON con las preguntas (CON respuestas: nunca sale del servidor) */
  quiz: (g: string) => `g:{${g}}:quiz`,
  /** Hash playerId → JSON { n: apodo, a: avatar, u: userId, k: expulsado } */
  players: (g: string) => `g:{${g}}:players`,
  /** Hash apodo-en-minúsculas → playerId (apodos únicos) */
  nicks: (g: string) => `g:{${g}}:nicks`,
  /** Hash userId → playerId (una cuenta = un jugador) */
  users: (g: string) => `g:{${g}}:users`,
  /** Hash token de reconexión → playerId */
  tokens: (g: string) => `g:{${g}}:tokens`,
  /** Sorted set playerId → puntaje (ranking instantáneo con ZREVRANGE) */
  scores: (g: string) => `g:{${g}}:scores`,
  /** Hash playerId → JSON { s: racha, b: mejor racha, c: aciertos, a: respondidas, bc: mayor subida } */
  pstate: (g: string) => `g:{${g}}:pstate`,
  /** Hash playerId → puesto en el último ranking / en el anterior */
  ranks: (g: string) => `g:{${g}}:ranks`,
  prevRanks: (g: string) => `g:{${g}}:prevranks`,
  /** Hash playerId → JSON de su respuesta a la pregunta i */
  answers: (g: string, i: number) => `g:{${g}}:q:${i}:answers`,
  /** Hash clave de respuesta → número de jugadores (distribución) */
  counts: (g: string, i: number) => `g:{${g}}:q:${i}:counts`,
  /** Hash con estadísticas de la pregunta: aciertos, respuesta correcta más rápida */
  qinfo: (g: string, i: number) => `g:{${g}}:q:${i}:info`,
  /** Hash playerId → índice de equipo (modos Equipos y Conquista) */
  teams: (g: string) => `g:{${g}}:teams`,
  /** Hash playerId → JSON de power-ups { have, dbl, tx, sh, sc } */
  powerups: (g: string) => `g:{${g}}:pu`,
  /** Pregunta abierta: autor → votos recibidos / votante → 1 */
  votes: (g: string, i: number) => `g:{${g}}:q:${i}:votes`,
  voters: (g: string, i: number) => `g:{${g}}:q:${i}:voters`,
  /** Dibujo: lista de trazos (para quien entra a mitad) */
  strokes: (g: string, i: number) => `g:{${g}}:q:${i}:strokes`,
  /** Instancia que lleva los temporizadores de la partida (con caducidad: failover) */
  owner: (g: string) => `g:{${g}}:owner`,
  /** PIN de 6 dígitos → gameId */
  pin: (pin: string) => `pin:${pin}`,
  /** Set con las partidas en curso (lo revisa el "barrendero" de cada instancia) */
  running: () => 'games:running',
};

/** Todas las claves fijas de una partida (para renovar su caducidad). */
export function gameKeys(g: string): string[] {
  return [
    keys.meta(g),
    keys.quiz(g),
    keys.players(g),
    keys.nicks(g),
    keys.users(g),
    keys.tokens(g),
    keys.scores(g),
    keys.pstate(g),
    keys.ranks(g),
    keys.prevRanks(g),
    keys.teams(g),
    keys.powerups(g),
  ];
}

/** Las partidas caducan solas 24 h después de la última actividad. */
export const GAME_TTL_SECONDS = 24 * 3600;
