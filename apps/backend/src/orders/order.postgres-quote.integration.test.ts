import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

// Integration test against a disposable LOCAL PostgreSQL database only.
// Run explicitly with KHD_QUOTE_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/khedmah_quote_test
const connection = process.env.KHD_QUOTE_TEST_DATABASE_URL;
test('PostgreSQL rejects stale quote atomically without events or promotion redemption', { skip: !connection }, async () => {
  const parsed = new URL(connection!);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  assert.match(database, /_test$/, 'test database name must end with _test');
  assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname), 'remote databases are forbidden');
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol), 'PostgreSQL only');
  const pool = new Pool({ connectionString: connection!, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE TEMP TABLE quote_test_orders (
        id text PRIMARY KEY, status text NOT NULL, updated_at timestamptz NOT NULL,
        total numeric NOT NULL, currency text NOT NULL
      ) ON COMMIT DROP`);
      await client.query(`CREATE TEMP TABLE quote_test_events (order_id text NOT NULL) ON COMMIT DROP`);
      await client.query(`CREATE TEMP TABLE quote_test_promotions (order_id text NOT NULL, status text NOT NULL) ON COMMIT DROP`);
      await client.query(`INSERT INTO quote_test_orders VALUES ('order-1','quoted','2026-11-11T12:00:01.000Z',1100,'SYP')`);
      await client.query(`INSERT INTO quote_test_promotions VALUES ('order-1','applied')`);
      const before = await client.query('SELECT status, updated_at, total, currency FROM quote_test_orders WHERE id=$1', ['order-1']);
      const result = await client.query(
        `UPDATE quote_test_orders SET status='merchant_confirmed'
         WHERE id=$1 AND status='quoted'
           AND date_trunc('milliseconds',updated_at)=$2::timestamptz
           AND total=$3::numeric AND currency=$4::text RETURNING id`,
        ['order-1', '2026-11-11T12:00:00.000Z', 1100, 'SYP'],
      );
      assert.equal(result.rowCount, 0, 'stale revision must reject the atomic update');
      const after = await client.query('SELECT status, updated_at, total, currency FROM quote_test_orders WHERE id=$1', ['order-1']);
      assert.deepEqual(after.rows, before.rows, 'order must be unchanged');
      const events = await client.query('SELECT count(*)::int AS count FROM quote_test_events');
      const promotions = await client.query('SELECT status FROM quote_test_promotions WHERE order_id=$1', ['order-1']);
      assert.equal(events.rows[0].count, 0, 'no transition event may be created');
      assert.equal(promotions.rows[0].status, 'applied', 'promotion must not be redeemed');
      await client.query('ROLLBACK');
    } finally { client.release(); }
  } finally { await pool.end(); }
});
