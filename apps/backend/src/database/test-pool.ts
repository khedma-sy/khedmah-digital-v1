import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

const CANONICAL_MIGRATIONS = [
  '001_core_identity_accounts',
  '002_create_profiles',
  '003_create_professional_profiles',
  '004_analytics_and_contact',
  '005_email_verifications_and_admin_roles',
  '006_media_assets',
  '007_v2_marketplace',
  '008_provider_service_radius',
  '009_canonical_identity_runtime',
  '010_canonical_runtime_domains',
  '011_canonical_media_contract',
  '012_nearby_preferences',
  '013_nearby_notifications_read_state',
  '014_supplier_discovery',
  '015_contact_target_contract',
  '016_contact_submission_idempotency',
  '017_category_taxonomy_contract',
  '018_persistent_rate_limit_buckets',
  '019_remove_out_of_scope_subscription_schema',
  '020_identity_recovery_oauth',
  '021_provider_reports'
] as const;

let canonicalSchemaSetup: Promise<void> | undefined;

/** Rebuilds the explicitly disposable test database from the governed lineage. */
export function resetCanonicalTestSchema(pool: Pool): Promise<void> {
  canonicalSchemaSetup ??= (async () => {
    await verifyTestDatabase(pool);
    const client = await pool.connect();
    try {
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
      for (const migration of CANONICAL_MIGRATIONS) {
        const sql = await readFile(
          resolve(__dirname, '../../../../backend/migrations/versions', `${migration}.sql`),
          'utf8'
        );
        await client.query(sql);
      }
    } finally {
      client.release();
    }
  })();
  return canonicalSchemaSetup;
}

export function assertSafeDisposableDatabaseName(databaseName: string): void {
  const normalized = databaseName.toLowerCase();
  if (!SAFE_DATABASE_NAME.test(normalized) || FORBIDDEN_DATABASE_NAMES.has(normalized)) {
    throw new Error(`UNSAFE_DESTRUCTIVE_DATABASE_TARGET: ${normalized || '<missing>'}`);
  }
}
