/**
 * Creates a pg Pool for use in backend tests.
 *
 * Resolution order:
 *   1. DATABASE_URL — used as-is (connectionString) when set.
 *   2. Individual PG* env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
 *
 * This ensures backend tests connect to the correct host in CI environments
 * (e.g. Cloud Build) where DATABASE_URL points to a sidecar container such as
 * `pg-test:5432` rather than `127.0.0.1:5432`.
 */
import { Pool } from 'pg';

export function createTestPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    return new Pool({ connectionString: databaseUrl });
  }

  return new Pool({
    host: process.env.PGHOST ?? '127.0.0.1',
    port: parseInt(process.env.PGPORT ?? '5432', 10),
    user: process.env.PGUSER ?? 'khedmah',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE ?? 'khedmah_dev',
  });
}
