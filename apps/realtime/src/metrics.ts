// Métricas Prometheus del servidor de tiempo real (GET /metrics).
//  • Conexiones y partidas en curso (por instancia y en todo el clúster).
//  • Cada evento de socket: cuántos, con qué resultado y cuánto tarda la respuesta (ack).
import type { Redis } from 'ioredis';
import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import type { IO } from './context';
import type { GameSocket } from './context';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'realtime' });
collectDefaultMetrics({ register: registry });

const events = new Counter({
  name: 'quizrush_socket_events_total',
  help: 'Eventos de socket recibidos por nombre y resultado (ok, error o sin respuesta)',
  labelNames: ['event', 'result'] as const,
  registers: [registry],
});

const latency = new Histogram({
  name: 'quizrush_socket_ack_seconds',
  help: 'Tiempo desde que llega un evento hasta que el servidor responde',
  labelNames: ['event'] as const,
  buckets: [0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

/** Mide los eventos de un socket (middleware de Socket.IO). */
export function instrumentSocket(socket: GameSocket) {
  socket.use((packet, next) => {
    const event = String(packet[0]);
    const last = packet[packet.length - 1];
    if (typeof last === 'function') {
      const end = latency.startTimer({ event });
      packet[packet.length - 1] = (res: { ok?: boolean }) => {
        end();
        events.inc({ event, result: res && res.ok === false ? 'error' : 'ok' });
        (last as (r: unknown) => void)(res);
      };
    } else {
      events.inc({ event, result: 'noack' });
    }
    next();
  });
}

/** Servidores activos en este proceso (en las pruebas puede haber varios). */
const servers = new Map<IO, Redis>();
let gaugesReady = false;

/**
 * Indicadores que se calculan al leer /metrics. Se registran una sola vez por proceso y suman
 * todos los servidores activos. Devuelve la función para darse de baja al cerrar.
 */
export function registerGauges(io: IO, redis: Redis) {
  servers.set(io, redis);
  if (!gaugesReady) {
    gaugesReady = true;
    new Gauge({
      name: 'quizrush_socket_connections',
      help: 'Conexiones abiertas en esta instancia',
      registers: [registry],
      collect() {
        let n = 0;
        for (const s of servers.keys()) n += s.engine.clientsCount;
        this.set(n);
      },
    });
    new Gauge({
      name: 'quizrush_games_running',
      help: 'Partidas en vivo en curso en todo el clúster',
      registers: [registry],
      async collect() {
        const r = servers.values().next().value;
        if (!r) return;
        try {
          this.set(await r.scard('games:running'));
        } catch {
          /* Redis caído: se mantiene el último valor */
        }
      },
    });
  }
  return () => servers.delete(io);
}
