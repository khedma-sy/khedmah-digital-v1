import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { test } from 'node:test';
import { HealthService } from './health.service';

test('readiness reports ready only after database probe succeeds', async () => {
  let probes = 0;
  const db = {
    query: async (sql: string) => {
      probes += 1;
      assert.equal(sql, 'SELECT 1 AS ready');
      return [{ ready: 1 }];
    }
  };

  const result = await new HealthService(db as any).getReadiness();
  assert.equal(probes, 1);
  assert.equal(result.status, 'ready');
  assert.equal(result.dependencies.database, 'ok');
});

test('readiness fails closed when the database cannot be reached', async () => {
  const db = { query: async () => { throw new Error('fixture database failure'); } };
  await assert.rejects(
    () => new HealthService(db as any).getReadiness(),
    (error: unknown) => error instanceof ServiceUnavailableException
  );
});
