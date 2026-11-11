import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { OrderRepository } from './order.repository';


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


// Exercises the ACTUAL OrderRepository.transition() against governed PostgreSQL
// migrations on a disposable _test database. This does not touch shared Preview
// or Production and does not certify serving Backend/image/Cloud SQL behavior.
test('real OrderRepository transition enforces each quote field and has exactly-once effects', { skip: !connection, timeout: 90_000 }, async () => {
  const parsed = new URL(connection!);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol), 'PostgreSQL only');
  assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname), 'loopback only');
  assert.match(decodeURIComponent(parsed.pathname.slice(1)), /_test$/, 'disposable database only');
  assert.equal(process.env.DATABASE_URL, connection, 'canonical fixture must use the same local _test database');
  assert.equal(process.env.ALLOW_DESTRUCTIVE_DB_TESTS, 'true', 'canonical fixture reset requires explicit test gate');

  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const repo = new OrderRepository(db);
  const customer = randomUUID(), merchantOwner = randomUUID(), outsider = randomUUID();
  const merchant = randomUUID(), orderId = randomUUID(), promoId = randomUUID(), claimId = randomUUID();
  try {
    await resetCanonicalTestSchema(pool);
    for (const migration of [
      '024_product_store', '025_classifieds', '026_cash_fulfillment_orders',
      '027_mobility_document_reviews', '028_platform_notifications',
      '034_food_order_promotions',
    ]) {
      await pool.query(await readFile(
        resolve(__dirname, '../../../../backend/migrations/versions', migration + '.sql'),
        'utf8',
      ));
    }
    await pool.query(
      `INSERT INTO core_user_accounts
         (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
       VALUES($1,$4,'individual_user','active','active','private'),
             ($2,$5,'individual_user','active','active','private'),
             ($3,$6,'individual_user','active','active','private')`,
      [customer, merchantOwner, outsider, 'id-' + customer, 'id-' + merchantOwner, 'id-' + outsider],
    );
    await pool.query(
      `INSERT INTO business_profiles(id,name,owner_user_id,category_code,city_code,country_code,visibility,moderation_status,trust_status,status)
       VALUES($1,'مطعم اختبار الاقتباس',$2,'restaurant','damascus','SY','public','approved','approved','active')`,
      [merchant, merchantOwner],
    );
    await pool.query(
      `INSERT INTO food_promo_codes
         (id,code,name_ar,merchant_business_id,created_by_user_id,discount_type,percentage_off,currency,minimum_subtotal,valid_from,valid_until)
       VALUES($1,'SALE10','خصم اختبار الاقتباس',$2,$3,'percentage',10,'SYP',100,
              NOW()-INTERVAL '1 hour',NOW()+INTERVAL '1 day')`,
      [promoId, merchant, merchantOwner],
    );
    const revision = '2026-11-11T12:00:00.000Z';
    await pool.query(
      `INSERT INTO fulfillment_orders
         (id,customer_user_id,merchant_business_id,vertical,status,payment_method,payment_status,currency,subtotal,
          delivery_fee,total,food_promo_id,promo_code,discount_amount,delivery_address,customer_phone,idempotency_key,created_at,updated_at)
       VALUES ($1,$2,$3,'food','quoted','cash','pending','SYP',1000,
               200,1100,$4,'SALE10',100,'Damascus test address','0999999999',$5,$6,$6)`,
      [orderId, customer, merchant, promoId, randomUUID(), revision],
    );
    await pool.query(
      `INSERT INTO food_promo_claims
         (id,promo_id,order_id,user_id,merchant_business_id,code_snapshot,subtotal_snapshot,discount_amount,currency,status)
       VALUES ($1,$2,$3,$4,$5,'SALE10',1000,100,'SYP','applied')`,
      [claimId, promoId, orderId, customer, merchant],
    );
    const order = await repo.findById(orderId);
    assert.ok(order, 'real projection and joined order must be readable');
    assert.equal(order.status, 'quoted');
    const expectedQuote = { updatedAt: order.updatedAt, total: order.total!, currency: order.currency };
    const attempt = (actor: string, quote = expectedQuote) =>
      repo.transition(order, 'merchant_confirmed', actor, { authority: 'customer', expectedQuote: quote });

    const snapshot = async () => {
      const [record] = (await pool.query(
        `SELECT status,updated_at,total,currency,confirmed_at FROM fulfillment_orders WHERE id=$1`,
        [orderId],
      )).rows;
      const [claim] = (await pool.query(
        `SELECT status,redeemed_at,released_at FROM food_promo_claims WHERE id=$1`,
        [claimId],
      )).rows;
      const [effects] = (await pool.query(
        `SELECT
           (SELECT count(*)::int FROM fulfillment_order_events WHERE order_id=$1) AS events,
           (SELECT count(*)::int FROM audit_logs WHERE event_type='fulfillment.order.status_changed' AND correlation_id=$2) AS audits,
           (SELECT count(*)::int FROM platform_notifications WHERE reference_id=$1) AS notifications`,
        [orderId, orderId + ':quoted:merchant_confirmed'],
      )).rows;
      return { record, claim, effects };
    };
    const pristine = await snapshot();
    assert.equal(pristine.effects.events, 0);
    assert.equal(pristine.effects.audits, 0);
    assert.equal(pristine.effects.notifications, 0);
    for (const [reason, quote] of [
      ['stale timestamp', { ...expectedQuote, updatedAt: new Date(Date.parse(revision) - 1).toISOString() }],
      ['changed amount', { ...expectedQuote, total: expectedQuote.total - 1 }],
      ['changed currency', { ...expectedQuote, currency: 'USD' as const }],
    ] as const) {
      assert.equal(await attempt(customer, quote), undefined, reason + ' must reject');
      assert.deepEqual(await snapshot(), pristine, reason + ' must not change status, promotion, event, audit, notification');
    }
    assert.equal(await attempt(outsider), undefined, 'non-owner must not confirm order');
    assert.deepEqual(await snapshot(), pristine, 'unauthorized actor must produce no side effects');
    const confirmed = await attempt(customer);
    assert.ok(confirmed, 'exact reviewed quote must confirm exactly once');
    assert.equal(confirmed.status, 'merchant_confirmed');
    const afterSuccess = await snapshot();
    assert.equal(afterSuccess.record.status, 'merchant_confirmed');
    assert.equal(afterSuccess.claim.status, 'redeemed');
    assert.ok(afterSuccess.claim.redeemed_at);
    assert.deepEqual(afterSuccess.effects, { events: 1, audits: 1, notifications: 1 });
    assert.equal(await attempt(customer), undefined, 'repeat must not reconfirm');
    assert.deepEqual(await snapshot(), afterSuccess, 'replay must not create duplicate side effects');
  } finally {
    await db.end();
  }
});
