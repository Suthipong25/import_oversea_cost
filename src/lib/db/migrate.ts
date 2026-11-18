import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

// Load .env.local first, then fallback to .env
config({ path: '.env.local' });
config({ path: '.env' });

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is not set. Create .env.local from .env.example first.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), 'drizzle');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const check = await client.query(
        'SELECT filename FROM _schema_migrations WHERE filename = $1',
        [file]
      );
      if (check.rowCount && check.rowCount > 0) {
        console.log(`  [skip] ${file} (already applied)`);
        continue;
      }

      const sqlContent = readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`  [run ] Applying ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query('INSERT INTO _schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  [done] ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('\nAll migrations applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
