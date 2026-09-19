import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { DatabasePool } from './database.pool';
import { createTestPool, verifyTestDatabase } from './test-pool';

// Actual PostgreSQL sockets and transactions. Only the explicitly named command
// failure is injected; the table, commit, rollback and pool replacement are real.
test('PostgreSQL transaction failures do not contaminate the next pool borrower', { timeout: 45_000 }, async t => {
  const witness = createTestPool();
  const pool = createTestPool();
  pool.options.max = 1;
  pool.options.connectionTimeoutMillis = 5_000;
  const schema = `db_recovery_${randomUUID().replaceAll('-', '')}`;
  const table = `"${schema}".writes`;
  let created = false;
  try {
    await verifyTestDatabase(witness);
    await verifyTestDatabase(pool);
    await witness.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await witness.query(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
    const count = async (id: string) => Number((await witness.query(`SELECT count(*) AS n FROM ${table} WHERE id=$1`, [id])).rows[0].n);
    const state = async () => {
      const client = await pool.connect();
      try {
        return (await client.query<{ pid: number; transaction_id: string | null }>(
          'SELECT pg_backend_pid() AS pid, txid_current_if_assigned() AS transaction_id'
        )).rows[0];
      } finally { client.release(); }
    };
    function withCommandFailure(phase: 'none' | 'rollback' | 'before-commit' | 'after-commit', primary: Error, breakRollback = false) {
      const adapter = {
        async connect(): Promise<PoolClient> {
          const actual = await pool.connect();
          return new Proxy(actual, {
            get(target, key, receiver) {
              const member = Reflect.get(target, key, receiver);
              if (key === 'query') return async (sql: string, values?: unknown[]) => {
                if (sql === 'ROLLBACK' && (phase === 'rollback' || breakRollback)) throw new Error('injected rollback transport failure');
                if (sql === 'COMMIT' && phase === 'before-commit') throw primary;
                const result = await target.query(sql, values);
                if (sql === 'COMMIT' && phase === 'after-commit') throw primary;
                return result;
              };
              return typeof member === 'function' ? member.bind(target) : member;
            }
          });
        }
      } as unknown as Pool;
      return DatabasePool.fromPool(adapter);
    }
    await t.test('successful commit is durable and returns a clean connection', async () => {
      const before = await state();
      const db = withCommandFailure('none', new Error('unused'));
      const result = await db.transaction(async client => {
        await client.query(`INSERT INTO ${table} VALUES ($1)`, ['committed']);
        return 'saved';
      });
      assert.equal(result, 'saved');
      assert.equal(await count('committed'), 1);
      const after = await state();
      assert.equal(after.pid, before.pid);
      assert.equal(after.transaction_id, null);
    });
    await t.test('successful rollback removes uncommitted data and keeps the clean client reusable', async () => {
      const before = await state();
      const primary = new Error('original business conflict');
      const db = withCommandFailure('none', primary);
      await assert.rejects(db.transaction(async client => {
        await client.query(`INSERT INTO ${table} VALUES ($1)`, ['rolled-back']);
        throw primary;
      }), error => error === primary);
      assert.equal(await count('rolled-back'), 0);
      const after = await state();
      assert.equal(after.pid, before.pid);
      assert.equal(after.transaction_id, null);
    });
    await t.test('failed rollback destroys the real socket; next borrower receives no previous transaction', async () => {
      const before = await state();
      const primary = new Error('preserve the original failure');
      const db = withCommandFailure('rollback', primary);
      await assert.rejects(db.transaction(async client => {
        await client.query(`INSERT INTO ${table} VALUES ($1)`, ['discarded']);
        throw primary;
      }), error => error === primary);
      const after = await state();
      assert.notEqual(after.pid, before.pid, 'a failed rollback must not return its socket to the pool');
      assert.equal(after.transaction_id, null);
      assert.equal(await count('discarded'), 0);
      // A subsequent successful write must never accidentally commit the lost write.
      await DatabasePool.fromPool(pool).transaction(async client => {
        await client.query(`INSERT INTO ${table} VALUES ($1)`, ['after-discard']);
      });
      assert.equal(await count('after-discard'), 1);
      assert.equal(await count('discarded'), 0);
    });
    for (const breakRollback of [false, true]) {
      await t.test(`failure before COMMIT is not replayed; broken rollback=${breakRollback}`, async () => {
        const before = await state();
        const primary = new Error('injected commit transport failure');
        const id = `commit-failed-${breakRollback}`;
        let attempts = 0;
        const db = withCommandFailure('before-commit', primary, breakRollback);
        await assert.rejects(db.transaction(async client => {
          attempts += 1;
          await client.query(`INSERT INTO ${table} VALUES ($1)`, [id]);
        }), error => error === primary);
        const after = await state();
        assert.equal(attempts, 1);
        assert.equal(await count(id), 0);
        assert.equal(after.transaction_id, null);
        if (breakRollback) assert.notEqual(after.pid, before.pid);
        else assert.equal(after.pid, before.pid);
      });
    }
    await t.test('lost acknowledgement after an actual COMMIT retains one write without replaying work', async () => {
      const primary = new Error('injected lost acknowledgement after commit');
      let attempts = 0;
      const db = withCommandFailure('after-commit', primary);
      await assert.rejects(db.transaction(async client => {
        attempts += 1;
        await client.query(`INSERT INTO ${table} VALUES ($1)`, ['ack-lost']);
      }), error => error === primary);
      assert.equal(attempts, 1);
      assert.equal(await count('ack-lost'), 1, 'a thrown COMMIT acknowledgement is not proof that the write failed');
      assert.equal((await state()).transaction_id, null);
    });
  } finally {
    await pool.end();
    try { if (created) await witness.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await witness.end(); }
  }
});
