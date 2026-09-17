import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createBackendApp } from './app';
import { createTestPool, resetCanonicalTestSchema } from './database/test-pool';

test('GET /api/v1/health returns platform health only', async () => {
  // Exercise the real application and startup schema gate, never a mock health
  // module. The shared helper rejects unapproved/non-disposable DB targets.
  const fixturePool = createTestPool();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let app: Awaited<ReturnType<typeof createBackendApp>> | undefined;

  try {
    await resetCanonicalTestSchema(fixturePool);
    await fixturePool.query(await readFile(
      resolve(__dirname, '../../../backend/migrations/versions/024_product_store.sql'), 'utf8'
    ));

    // CI provides PG* to its disposable PostgreSQL service, whereas application
    // startup deliberately requires DATABASE_URL. Bridge only this test fixture.
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
    assert.equal(typeof body.timestamp, 'string');
    assert.equal(typeof body.version, 'string');

    const readiness = await fetch(`${origin}/api/v1/health/ready`);
    assert.equal(readiness.status, 200);
    assert.deepEqual((await readiness.json()).dependencies, { database: 'ok' });
  } finally {
    try {
      await app?.close();
    } finally {
      try {
        await fixturePool.end();
      } finally {
        if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  }
});
