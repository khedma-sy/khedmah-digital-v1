import { Pool } from 'pg';

const SAFE_DATABASE_NAME = /^[a-z0-9_]*(?:_test|_ci)$/;
const FORBIDDEN_DATABASE_NAMES = new Set(['postgres', 'template0', 'template1', 'khedmah', 'khedmah_dev', 'khedmah_prod', 'production']);

export function createTestPool(): Pool {
  if (process.env.ALLOW_DESTRUCTIVE_DB_TESTS !== 'true') {
    throw new Error('DESTRUCTIVE_DB_TESTS_DISABLED: set ALLOW_DESTRUCTIVE_DB_TESTS=true for an approved disposable database.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  const databaseName = databaseUrl
    ? decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''))
    : (process.env.PGDATABASE ?? '');

  assertSafeDisposableDatabaseName(databaseName);

  return databaseUrl
    ? new Pool({ connectionString: databaseUrl })
    : new Pool({
        host: process.env.PGHOST ?? '127.0.0.1',
        port: Number.parseInt(process.env.PGPORT ?? '5432', 10),
        user: process.env.PGUSER ?? 'khedmah',
        password: process.env.PGPASSWORD,
        database: databaseName
      });
}

export async function verifyTestDatabase(pool: Pool): Promise<void> {
  const result = await pool.query<{ database_name: string }>('SELECT current_database() AS database_name');
  const databaseName = result.rows[0]?.database_name ?? '';
  assertSafeDisposableDatabaseName(databaseName);
}

export function assertSafeDisposableDatabaseName(databaseName: string): void {
  const normalized = databaseName.toLowerCase();
  if (!SAFE_DATABASE_NAME.test(normalized) || FORBIDDEN_DATABASE_NAMES.has(normalized)) {
    throw new Error(`UNSAFE_DESTRUCTIVE_DATABASE_TARGET: ${normalized || '<missing>'}`);
  }
}
