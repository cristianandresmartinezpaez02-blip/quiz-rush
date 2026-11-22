// Configuración y dependencias compartidas por todo el servidor de tiempo real.
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@quiz-rush/shared';
import type { Logger } from 'pino';

export const config = {
  port: Number(process.env.REALTIME_PORT ?? process.env.PORT ?? 4000),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  /** Prefijo de los canales del adaptador de Socket.IO (pub/sub de Redis es global a todas las bases) */
  adapterKey: process.env.REALTIME_ADAPTER_KEY || 'socket.io',
  corsOrigin: (process.env.REALTIME_CORS_ORIGIN ?? 'http://localhost:3000').split(','),
  /** URL de la app web: emite los JWT y publica las claves públicas (JWKS) */
  webUrl: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  jwtAudience: 'quiz-rush-realtime',
  /**
   * De dónde descargar las claves públicas. Por defecto, de la URL pública de la web; en
   * producción puede apuntar a una URL interna (p. ej. http://web:3000/api/auth/jwks).
   */
  jwksUrl: process.env.REALTIME_JWKS_URL || undefined,
  /**
   * Antibots: intentos de entrar por IP y minuto. Un colegio entero suele salir por UNA sola IP
   * (NAT), así que el límite tiene que permitir que una clase grande entre a la vez.
   */
  joinRatePerMin: Number(process.env.JOIN_RATE_PER_MIN ?? 120),
  /** Propiedad de los temporizadores: caduca si la instancia muere (failover) */
  ownerTtlMs: 5000,
  ownerRenewMs: 2000,
  sweepIntervalMs: 1000,
};

/** Eventos entre instancias del servidor (vía el adaptador de Redis). */
export interface InterServerEvents {
  /** Cada instancia entrega los resultados personales a SUS jugadores conectados */
  'deliver:results': (gameId: string, qIndex: number) => void;
  'deliver:final': (gameId: string) => void;
  /** Datos personales al empezar cada pregunta (palabra del dibujo, rival del torneo…) */
  'deliver:meta': (gameId: string) => void;
  /** Duelo: los dos respondieron en instancias distintas; la dueña revela sin esperar */
  'duel:check': (duelId: string) => void;
}

export interface SocketData {
  role?: 'host' | 'spectator' | 'player';
  gameId?: string;
  playerId?: string;
  userId?: string;
  ip?: string;
  /** Duelo: entrada en la cola de emparejamiento / código privado (para limpiarlos al salir) */
  duelEntry?: string;
  duelCode?: string;
}

export type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface Ctx {
  io: IO;
  /** Conexión para comandos (las de pub/sub las usa el adaptador) */
  redis: Redis;
  log: Logger;
  /** Identificador único de esta instancia (para la propiedad de temporizadores) */
  instanceId: string;
}

export const newInstanceId = () => `rt-${process.pid}-${randomUUID().slice(0, 8)}`;

/** Salas de Socket.IO de una partida */
export const rooms = {
  all: (g: string) => `game:${g}`,
  /** Anfitrión y pantallas de espectador */
  screen: (g: string) => `game:${g}:screen`,
  players: (g: string) => `game:${g}:players`,
  /** Sala privada de un jugador (todas sus pestañas/reconexiones) */
  player: (pid: string) => `p:${pid}`,
};
