// Logs estructurados en JSON (en desarrollo se muestran legibles con pino-pretty).
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  name: 'realtime',
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  }),
});
