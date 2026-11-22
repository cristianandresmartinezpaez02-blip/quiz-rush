// Configuración de Prisma 7: la URL de la base de datos vive aquí (no en schema.prisma).
// Las migraciones usan la conexión DIRECTA (sin PgBouncer), como recomienda Prisma.
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Variables de entorno compartidas del monorepo (.env en la raíz)
loadEnv({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed.ts',
  },
  datasource: {
    url:
      process.env.DIRECT_DATABASE_URL ??
      process.env.DATABASE_URL ??
      // Valor de respaldo para que "prisma generate" funcione sin .env (p. ej. en CI)
      'postgresql://quizrush:quizrush@localhost:5432/quizrush',
  },
});
