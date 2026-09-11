import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { AdSchemaGuard, ClassifiedsSchemaError } from '../classifieds/ad-schema.guard';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';

const MIGRATION_025_SHA256 = '0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d';
const repositoryRoot = resolve(__dirname, '../../../..');
const migration024Path = resolve(repositoryRoot, 'backend/migrations/versions/024_product_store.sql');
const migration025Path = resolve(repositoryRoot, 'backend/migrations/versions/025_classifieds.sql');
const probePath = resolve(repositoryRoot, 'scripts/deployment/run-classifieds-nonproduction-migration.sh');

function disposableDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const database = process.env.PGDATABASE ?? '';
  assert.ok(database, 'PGDATABASE is required for Classifieds PostgreSQL probe acceptance');
  const url = new URL('postgresql://localhost');
  url.hostname = process.env.PGHOST ?? '127.0.0.1';
  url.port = process.env.PGPORT ?? '5432';
  url.username = process.env.PGUSER ?? 'khedmah';
  if (process.env.PGPASSWORD) url.password = process.env.PGPASSWORD;
  url.pathname = `/${database}`;
  return url.toString();
}

function runProbe(databaseUrl: string) {
  return spawnSync('sh', [probePath], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DEPLOYMENT_ENVIRONMENT: 'preview',
      MIGRATION_MODE: 'verify',
      GOOGLE_CLOUD_PROJECT: 'khedmah-preview-ci',
      PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedmah-production-protected',
      MIGRATION_SHA256: MIGRATION_025_SHA256,
      CLASSIFIEDS_MIGRATION_FILE: migration025Path
    },
    encoding: 'utf8'
  });
}

async function withClassifiedsEnabled<T>(work: () => Promise<T>): Promise<T> {
  const previous = process.env.CLASSIFIEDS_ENABLED;
  process.env.CLASSIFIEDS_ENABLED = 'true';
  try { return await work(); }
  finally {
    if (previous === undefined) delete process.env.CLASSIFIEDS_ENABLED;
    else process.env.CLASSIFIEDS_ENABLED = previous;
  }
}

test('Classifieds shell and startup schema gates reject pre-025 and verify post-025 PostgreSQL', async () => {
  const rawPool = createTestPool();
  const db = DatabasePool.fromPool(rawPool);
  try {
    await resetCanonicalTestSchema(rawPool);
    await db.query(await readFile(migration024Path, 'utf8'));

    const before = runProbe(disposableDatabaseUrl());
    assert.equal(before.status, 42, `pre-025 probe failed unexpectedly: ${before.stderr || before.stdout}`);
    await assert.rejects(
      () => withClassifiedsEnabled(() => new AdSchemaGuard(db).onModuleInit()),
      (error: unknown) => {
        assert.ok(error instanceof ClassifiedsSchemaError);
        assert.match(error.message, /CLASSIFIEDS_SCHEMA_INCOMPATIBLE required=025/);
        return true;
      }
    );

    await db.query(await readFile(migration025Path, 'utf8'));
    const after = runProbe(disposableDatabaseUrl());
    assert.equal(after.status, 0, `post-025 probe failed unexpectedly: ${after.stderr || after.stdout}`);
    assert.match(after.stdout, /MIGRATION_025_ALREADY_APPLIED_AND_VERIFIED/);
    await assert.doesNotReject(() => withClassifiedsEnabled(() => new AdSchemaGuard(db).onModuleInit()));
  } finally {
    await db.end();
  }
});
