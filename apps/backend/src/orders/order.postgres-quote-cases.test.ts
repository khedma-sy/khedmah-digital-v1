import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

// LOCAL-only disposable test database. Never point this test at shared Preview/Production.
const connection = process.env.KHD_QUOTE_TEST_DATABASE_URL;
test("quote compare-and-swap rejects independent stale fields and confirms only once", { skip: !connection }, async () => {
  const url = new URL(connection!);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname));
  assert.match(decodeURIComponent(url.pathname.slice(1)), /_test$/);
  const pool = new Pool({ connectionString: connection!, max: 2 });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      try {
        await client.query(`CREATE TEMP TABLE quote_guard_orders (
          id text PRIMARY KEY, status text NOT NULL, updated_at timestamptz NOT NULL,
          total numeric NOT NULL, currency text NOT NULL, customer_id text NOT NULL
        ) ON COMMIT DROP`);
        await client.query(`INSERT INTO quote_guard_orders
          VALUES ('order-1','quoted','2026-11-11T12:00:00.000Z',1100,'SYP','customer-1')`);
        const update = `UPDATE quote_guard_orders SET status='merchant_confirmed'
          WHERE id=$1 AND status='quoted' AND customer_id=$2
            AND date_trunc('milliseconds',updated_at)=$3::timestamptz
            AND total=$4::numeric AND currency=$5::text RETURNING id`;
        const valid = ["order-1", "customer-1", "2026-11-11T12:00:00.000Z", 1100, "SYP"] as const;
        const invalid = [
          ["stale timestamp", ["order-1", "customer-1", "2026-11-11T12:00:01.000Z", 1100, "SYP"]],
          ["changed total", ["order-1", "customer-1", "2026-11-11T12:00:00.000Z", 1200, "SYP"]],
          ["changed currency", ["order-1", "customer-1", "2026-11-11T12:00:00.000Z", 1100, "USD"]],
          ["wrong customer", ["order-1", "other-customer", "2026-11-11T12:00:00.000Z", 1100, "SYP"]],
        ] as const;
        for (const [label, params] of invalid) {
          const result = await client.query(update, [...params]);
          assert.equal(result.rowCount, 0, label);
          const state = await client.query("SELECT status FROM quote_guard_orders WHERE id='order-1'");
          assert.equal(state.rows[0].status, "quoted", label + " must not mutate status");
        }
        assert.equal((await client.query(update, [...valid])).rowCount, 1, "matching quote confirms");
        assert.equal((await client.query(update, [...valid])).rowCount, 0, "replay cannot confirm twice");
        assert.equal((await client.query("SELECT status FROM quote_guard_orders WHERE id='order-1'")).rows[0].status, "merchant_confirmed");
      } finally {
        await client.query("ROLLBACK");
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});

test("concurrent confirmation attempts cannot both succeed", { skip: !connection }, async () => {
  const url = new URL(connection!);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname));
  assert.match(decodeURIComponent(url.pathname.slice(1)), /_test$/);
  const pool = new Pool({ connectionString: connection!, max: 2 });
  const table = "quote_guard_concurrency_" + process.pid;
  try {
    // Separate real PostgreSQL sessions; one conditional update wins the row lock.
    await pool.query(`CREATE TABLE "${table}" (
      id text PRIMARY KEY, status text NOT NULL, updated_at timestamptz NOT NULL,
      total numeric NOT NULL, currency text NOT NULL
    )`);
    try {
      await pool.query(`INSERT INTO "${table}" VALUES ('order-1','quoted','2026-11-11T12:00:00.000Z',1100,'SYP')`);
      const sql = `UPDATE "${table}" SET status='merchant_confirmed'
        WHERE id=$1 AND status='quoted'
        AND date_trunc('milliseconds',updated_at)=$2::timestamptz
        AND total=$3::numeric AND currency=$4::text RETURNING id`;
      const args = ["order-1", "2026-11-11T12:00:00.000Z", 1100, "SYP"];
      const outcomes = await Promise.all([pool.query(sql, args), pool.query(sql, args)]);
      assert.deepEqual(outcomes.map(r => r.rowCount).sort(), [0, 1]);
      const result = await pool.query(`SELECT status FROM "${table}" WHERE id='order-1'`);
      assert.equal(result.rows[0].status, "merchant_confirmed");
    } finally {
      await pool.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  } finally {
    await pool.end();
  }
});
