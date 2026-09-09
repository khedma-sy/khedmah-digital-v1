import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { DatabasePool } from './database.pool';

function fixture(failures: Record<string, unknown> = {}) {
  const statements: string[] = [];
  const released: Array<boolean | Error | undefined> = [];
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (Object.hasOwn(failures, sql)) throw failures[sql];
      return { rows: [], rowCount: 0 };
    },
    release(error?: boolean | Error) { released.push(error); }
  } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;
  return { db: DatabasePool.fromPool(pool), statements, released, client };
}

test('transaction commits once and releases the same client after returning its result', async () => {
  const f = fixture();
  const value = { id: 'committed-once' };
  const result = await f.db.transaction(async client => {
    assert.equal(client, f.client);
    await client.query('work');
    return value;
  });
  assert.equal(result, value);
  assert.deepEqual(f.statements, ['BEGIN', 'work', 'COMMIT']);
  assert.deepEqual(f.released, [undefined]);
});

test('transaction preserves a business error after successful rollback', async () => {
  const original = Object.assign(new Error('version conflict'), { code: 'VERSION_CONFLICT' });
  const f = fixture();
  await assert.rejects(f.db.transaction(async () => { throw original; }), error => error === original);
  assert.deepEqual(f.statements, ['BEGIN', 'ROLLBACK']);
  assert.deepEqual(f.released, [undefined]);
});

for (const rollbackFailure of [new Error('connection lost'), 'non-error rejection', undefined]) {
  test(`failed rollback destroys the client and preserves the primary error: ${typeof rollbackFailure}`, async () => {
    const original = Object.assign(new Error('original business failure'), { code: 'VERSION_CONFLICT' });
    const f = fixture({ ROLLBACK: rollbackFailure });
    await assert.rejects(f.db.transaction(async () => { throw original; }), error => error === original);
    assert.deepEqual(f.statements, ['BEGIN', 'ROLLBACK']);
    assert.deepEqual(f.released, [true]);
  });
}

for (const brokenRollback of [false, true]) {
  test(`uncertain commit is never retried; broken rollback=${brokenRollback}`, async () => {
    const original = new Error('commit acknowledgement unavailable');
    const f = fixture({ COMMIT: original, ...(brokenRollback ? { ROLLBACK: new Error('rollback unavailable') } : {}) });
    let attempts = 0;
    await assert.rejects(f.db.transaction(async () => { attempts += 1; return 'result'; }), error => error === original);
    assert.equal(attempts, 1);
    assert.deepEqual(f.statements, ['BEGIN', 'COMMIT', 'ROLLBACK']);
    assert.deepEqual(f.released, [brokenRollback ? true : undefined]);
  });
}

test('failed BEGIN never invokes business work and releases an unusable client', async () => {
  const original = new Error('begin unavailable');
  const f = fixture({ BEGIN: original, ROLLBACK: new Error('connection lost') });
  let attempts = 0;
  await assert.rejects(f.db.transaction(async () => { attempts += 1; }), error => error === original);
  assert.equal(attempts, 0);
  assert.deepEqual(f.statements, ['BEGIN', 'ROLLBACK']);
  assert.deepEqual(f.released, [true]);
});

test('checkout failure never invokes business work', async () => {
  const original = new Error('pool unavailable');
  const db = DatabasePool.fromPool({ connect: async () => { throw original; } } as unknown as Pool);
  let attempts = 0;
  await assert.rejects(db.transaction(async () => { attempts += 1; }), error => error === original);
  assert.equal(attempts, 0);
});
