import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fail, ok } from '@/lib/http/response';

export async function GET() {
  try {
    const result = await db.execute(
      sql`SELECT current_database() AS database_name, count(*)::int AS table_count FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const row = result.rows[0] as { database_name?: string; table_count?: number } | undefined;
    return ok({
      status: 'connected',
      database: row?.database_name ?? 'unknown',
      tables: row?.table_count ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database connection failed';
    return fail('DB_UNAVAILABLE', message, 503);
  }
}
