import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pgPool?: Pool; pgPoolUrl?: string };

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and point DATABASE_URL to your Perkin PostgreSQL server.'
    );
  }
  return url;
}

export function getPool(): Pool {
  const connectionString = getConnectionString();
  if (!globalForDb.pgPool || globalForDb.pgPoolUrl !== connectionString) {
    if (globalForDb.pgPool) {
      void globalForDb.pgPool.end().catch(() => {});
    }
    const pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    });
    pool.on('error', () => {
      // Prevent dropped idle LAN connections from crashing the Next.js server process
    });
    globalForDb.pgPool = pool;
    globalForDb.pgPoolUrl = connectionString;
  }
  return globalForDb.pgPool;
}

export const db = drizzle({
  client: new Proxy({} as Pool, {
    get(_target, prop) {
      const pool = getPool();
      const val = Reflect.get(pool, prop);
      return typeof val === 'function' ? val.bind(pool) : val;
    },
  }),
  schema,
});

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs a database transaction with PostgreSQL session variables populated
 * so Row-Level Security (RLS) policies can enforce role/ownership checks.
 */
export async function withUserContext<T>(
  user: { id: string; role: string },
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${user.id}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_role', ${user.role}, true)`);
    return fn(tx);
  });
}
