// Carga el .env de la raíz (DATABASE_URL, REDIS_URL…) antes de las pruebas.
import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

// Las pruebas usan su propia base de Redis (la 1) y sus propios canales del adaptador:
// así el servidor de desarrollo (base 0) nunca "adopta" partidas de prueba con su barrido
// de failover, ni recibe sus mensajes entre instancias.
process.env.REDIS_URL =
  (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '') + '/1';
process.env.REALTIME_ADAPTER_KEY = 'socket.io-test';

// Todas las pruebas entran desde la misma IP (localhost): sin límite práctico de entradas
process.env.JOIN_RATE_PER_MIN = '100000';
