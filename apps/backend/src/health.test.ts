import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createBackendApp } from './app';
import { createTestPool, resetCanonicalTestSchema } from './database/test-pool';

const RELEASE_MIGRATIONS = [
  '024_product_store',
  '025_classifieds',
  '026_cash_fulfillment_orders',
  '027_mobility_document_reviews',
  '028_platform_notifications',
  '029_taxi_pricing_revisions',
  '030_billing_credits_subscriptions',
  '031_taxi_operational_approvals',
  '032_taxi_operational_profile_gate',
  '033_billing_admin_role',
  '034_food_order_promotions'
] as const;

test('GET /api/v1/health and /ready exercise the real schema 034 startup gate', async () => {
  const fixturePool = createTestPool();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let app: Awaited<ReturnType<typeof createBackendApp>> | undefined;

  try {
    await resetCanonicalTestSchema(fixturePool);
    await fixturePool.query('DROP SCHEMA IF EXISTS khedmah_taxi CASCADE');
    for (const migration of RELEASE_MIGRATIONS) {
      const sql = await readFile(
        resolve(__dirname, '../../../backend/migrations/versions', `${migration}.sql`),
        'utf8'
      );
      await fixturePool.query(sql);
    }

    if (!originalDatabaseUrl) {
      const host = process.env.PGHOST ?? '127.0.0.1';
      assert.ok(!host.includes('/'), 'Use DATABASE_URL for non-TCP test database connections.');
      const url = new URL('postgresql://127.0.0.1');
      url.hostname = host;
      url.port = process.env.PGPORT ?? '5432';
      url.username = process.env.PGUSER ?? 'khedmah';
      url.password = process.env.PGPASSWORD ?? '';
      url.pathname = `/${process.env.PGDATABASE}`;
      process.env.DATABASE_URL = url.toString();
    }

    app = await createBackendApp();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.equal(typeof address, 'object');
    assert.notEqual(address, null);
    const origin = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${origin}/api/v1/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['status', 'timestamp', 'version']);
    assert.equal(body.status, 'ok');

    const readiness = await fetch(`${origin}/api/v1/health/ready`);
    assert.equal(readiness.status, 200);
    assert.deepEqual((await readiness.json()).dependencies, { database: 'ok' });
  } finally {
    try {
      await app?.close();
    } finally {
      await fixturePool.end();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
