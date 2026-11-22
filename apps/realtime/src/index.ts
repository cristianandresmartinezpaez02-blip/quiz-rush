// Servidor de tiempo real de Quiz_Rush (Socket.IO + Redis).
// Varias instancias detrás de un balanceador comparten las partidas a través de Redis.
import { config } from './context';
import { logger } from './logger';
import { initSentry, flushSentry } from './sentry';
import { createRealtime } from './server';

initSentry();

async function main() {
  const rt = await createRealtime({ port: config.port, log: logger });
  logger.info({ port: config.port }, '⚡ Servidor de tiempo real listo');

  // Apagado ordenado: deja de aceptar conexiones; las partidas siguen en Redis y otra
  // instancia retoma sus temporizadores cuando caduque la propiedad de esta.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Cerrando servidor de tiempo real…');
    await rt.close();
    await flushSentry();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'No se pudo iniciar el servidor de tiempo real');
  process.exit(1);
});
