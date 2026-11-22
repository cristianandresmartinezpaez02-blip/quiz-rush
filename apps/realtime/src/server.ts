// Construcción del servidor de tiempo real (reutilizable en las pruebas de integración).
import { createServer, type Server as HttpServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { Server } from 'socket.io';
import { config, newInstanceId, type Ctx, type IO } from './context';
import { DuelManager } from './duel';
import { GameEngine } from './game/engine';
import { GameStore } from './game/store';
import { registerHandlers } from './handlers';
import { registerGauges, registry } from './metrics';

export interface Realtime {
  httpServer: HttpServer;
  io: IO;
  engine: GameEngine;
  store: GameStore;
  close: () => Promise<void>;
}

/** /metrics: abierto si no hay METRICS_TOKEN (red interna); si lo hay, exige "Bearer <token>". */
function metricsAllowed(header: string | undefined) {
  const token = process.env.METRICS_TOKEN ?? '';
  if (!token) return true;
  const given = header?.startsWith('Bearer ') ? header.slice(7) : '';
  return given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token));
}

export async function createRealtime(opts: {
  port: number;
  redisUrl?: string;
  log: Logger;
}): Promise<Realtime> {
  const redisUrl = opts.redisUrl ?? config.redisUrl;
  // Tres conexiones: comandos, y publicar/suscribirse para el adaptador (requisito de Pub/Sub)
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  const pub = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  const sub = pub.duplicate();
  for (const [name, c] of [
    ['cmd', redis],
    ['pub', pub],
    ['sub', sub],
  ] as const) {
    c.on('error', (err) => opts.log.error({ err: err.message, client: name }, 'Error de Redis'));
  }

  const startedAt = Date.now();

  const httpServer = createServer(async (req, res) => {
    if (req.url === '/health') {
      let redisStatus = 'down';
      try {
        redisStatus = (await redis.ping()) === 'PONG' ? 'up' : 'down';
      } catch {
        /* Redis no disponible */
      }
      const ok = redisStatus === 'up';
      res.writeHead(ok ? 200 : 503, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(
        JSON.stringify({
          status: ok ? 'ok' : 'degraded',
          service: 'realtime',
          redis: redisStatus,
          connections: io.engine.clientsCount,
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        }),
      );
      return;
    }
    if (req.url === '/metrics' && metricsAllowed(req.headers.authorization)) {
      res.writeHead(200, { 'content-type': registry.contentType, 'cache-control': 'no-store' });
      res.end(await registry.metrics());
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  // (el manejador de /health de arriba solo se ejecuta cuando `io` ya existe)
  const io: IO = new Server(httpServer, {
    cors: { origin: config.corsOrigin, credentials: true },
    transports: ['websocket', 'polling'],
    // Mensajes pequeños: sin compresión por mensaje (cuesta más CPU que lo que ahorra aquí)
    perMessageDeflate: false,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 16 * 1024,
    // Si la conexión se corta brevemente, Socket.IO recupera salas y eventos perdidos
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: true },
  });
  io.adapter(createAdapter(pub, sub, { key: config.adapterKey }));

  const unregisterGauges = registerGauges(io, redis);
  const ctx: Ctx = { io, redis, log: opts.log, instanceId: newInstanceId() };
  const store = new GameStore(redis);
  const engine = new GameEngine(ctx, store);
  const duels = new DuelManager(ctx);
  const handlers = registerHandlers(ctx, store, engine, duels);
  engine.startLoops();

  await new Promise<void>((resolve) => httpServer.listen(opts.port, resolve));

  return {
    httpServer,
    io,
    engine,
    store,
    async close() {
      unregisterGauges();
      engine.stop();
      duels.stop();
      handlers.stop();
      io.close();
      await Promise.allSettled([redis.quit(), pub.quit(), sub.quit()]);
    },
  };
}
