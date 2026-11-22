// Cliente de base de datos compartido (Prisma 7 + adaptador node-postgres).
//
// • `db`     → base principal (escrituras y lecturas que necesitan consistencia).
// • `dbRead` → réplica de solo lectura (biblioteca, rankings). Si no hay réplica
//              configurada, apunta a la base principal.
//
// En desarrollo se reutiliza la misma instancia entre recargas en caliente
// para no abrir cientos de conexiones.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

type Clients = { db: PrismaClient; dbRead: PrismaClient };

const globalForPrisma = globalThis as unknown as { __quizRushPrisma?: Clients };

function createClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    // Conexiones por instancia; PgBouncer multiplexa hacia Postgres.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

function createClients(): Clients {
  let url = process.env.DATABASE_URL;
  if (!url) {
    // Ocurre durante "next build" (no hay base de datos). El adaptador no conecta hasta la
    // primera consulta, así que el build funciona; en ejecución la consulta fallará con este host.
    console.warn('[db] DATABASE_URL no está definida: las consultas fallarán hasta configurarla');
    url = 'postgresql://falta-DATABASE_URL@database-url-not-set.invalid:5432/quizrush';
  }
  const db = createClient(url);
  const readUrl = process.env.DATABASE_READ_URL;
  const dbRead = readUrl ? createClient(readUrl) : db;
  return { db, dbRead };
}

/** Crea los clientes en el primer uso (el build no necesita base de datos). */
function getClients(): Clients {
  globalForPrisma.__quizRushPrisma ??= createClients();
  return globalForPrisma.__quizRushPrisma;
}

/** Proxy perezoso: `db.quiz.findMany()` crea la conexión solo cuando se usa por primera vez. */
function lazy(pick: (c: Clients) => PrismaClient): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      const client = pick(getClients());
      const value = Reflect.get(client, prop, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
}

export const db = lazy((c) => c.db);
export const dbRead = lazy((c) => c.dbRead);
