import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createBackendApp } from '../app';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import { SessionTokenService } from '../identity/security/session-token.service';

// Only the GitHub Actions disposable localhost PostgreSQL fixture may run this
// destructive test. No credentials, real orders or external cloud APIs.
const url = process.env.KHD_QUOTE_TEST_DATABASE_URL;
test('real signed HTTP order confirmation enforces persisted quote, actor and exactly-once effects',
  { skip: !url, timeout: 120_000 }, async () => {
    const parsed = new URL(url!);
    assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol));
    assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname));
    assert.match(decodeURIComponent(parsed.pathname.slice(1)), /_test$/);
    assert.equal(parsed.search, '');
    assert.equal(parsed.hash, '');
    assert.equal(process.env.DATABASE_URL, url);
    assert.equal(process.env.ALLOW_DESTRUCTIVE_DB_TESTS, 'true');

    const former = {
      NODE_ENV: process.env.NODE_ENV,
      CORS_ORIGIN: process.env.CORS_ORIGIN,
      ORDER_CONFIRMATION_REQUIRE_REVIEWED_QUOTE: process.env.ORDER_CONFIRMATION_REQUIRE_REVIEWED_QUOTE,
    };
    const pool = createTestPool();
    const db = DatabasePool.fromPool(pool);
    let app: Awaited<ReturnType<typeof createBackendApp>> | undefined;
    try {
      await resetCanonicalTestSchema(pool);
      await pool.query('DROP SCHEMA IF EXISTS khedmah_taxi CASCADE');
      const migrations = [
        '024_product_store', '025_classifieds', '026_cash_fulfillment_orders',
        '027_mobility_document_reviews', '028_platform_notifications',
        '029_taxi_pricing_revisions', '030_billing_credits_subscriptions',
        '031_taxi_operational_approvals', '032_taxi_operational_profile_gate',
        '033_billing_admin_role', '034_food_order_promotions', '035_specialized_admin_roles',
        '036_classifieds_rolling_publication_quota', '037_verification_evidence_media',
      ];
      for (const migration of migrations) {
        await pool.query(await readFile(
          resolve(__dirname, '../../../../backend/migrations/versions', migration + '.sql'), 'utf8'));
      }

      const identity = new IdentityRepository(db);
      const sessions = new SessionTokenService();
      const now = new Date().toISOString();
      const users = [randomUUID(), randomUUID(), randomUUID()];
      const cookies: string[] = [];
      for (const [index, id] of users.entries()) {
        await identity.saveAccount({
          id, email: `fixture${index}@example.invalid`, passwordHash: 'fixture-not-for-login',
          status: 'active', createdAt: now, updatedAt: now,
        });
        await identity.saveProfile({
          userId: id, displayName: 'Test only', locale: 'ar', createdAt: now, updatedAt: now,
        });
        const token = sessions.createToken();
        await identity.saveSession({
          id: randomUUID(), userId: id, tokenHash: sessions.hashToken(token),
          expiresAt: sessions.expiresAt(), createdAt: now,
        });
        cookies.push('khedmah_session=' + encodeURIComponent(token));
      }

      const merchantId = randomUUID(), orderId = randomUUID();
      await pool.query(
        `INSERT INTO business_profiles (id,name,owner_user_id,category_code,city_code,
             country_code,visibility,moderation_status,trust_status,status)
         VALUES ($1,'مطبخ اختبار آلي',$2,'restaurant','damascus',
                 'SY','public','approved','approved','active')`,
        [merchantId, users[1]],
      );
      const originalRevision = '2026-11-16T12:00:00.000Z';
      await pool.query(
        `INSERT INTO fulfillment_orders (
            id, customer_user_id, merchant_business_id, vertical, status,
            payment_method, payment_status, currency, subtotal, delivery_fee, total,
            discount_amount, delivery_address, customer_phone, idempotency_key,
            created_at, updated_at
         ) VALUES ($1,$2,$3,'food','quoted','cash','pending','SYP',
                   1000,200,1200,0,'synthetic fixture','0000000000',$4,$5,$5)`,
        [orderId, users[0], merchantId, randomUUID(), originalRevision],
      );

      // The service and repository execute SQL through the same disposable DB.
      process.env.NODE_ENV = 'development';
      process.env.CORS_ORIGIN = 'http://localhost:3000';
      process.env.ORDER_CONFIRMATION_REQUIRE_REVIEWED_QUOTE = 'true';
      app = await createBackendApp();
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address();
      assert.ok(address && typeof address !== 'string');
      const origin = `http://127.0.0.1:${address.port}`;

      const read = async (path: string, cookie?: string) =>
        fetch(origin + path, { headers: cookie ? { Cookie: cookie } : {} });
      const patch = async (cookie: string, input: unknown) =>
        fetch(origin + '/api/v1/orders/' + orderId + '/status', {
          method: 'PATCH',
          headers: {
            Cookie: cookie, Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });
      const snapshot = async () => {
        const [order] = (await pool.query(
          'SELECT status,total,currency,updated_at,confirmed_at FROM fulfillment_orders WHERE id=$1',
          [orderId],
        )).rows;
        const [effects] = (await pool.query(
          `SELECT
              (SELECT count(*)::int FROM fulfillment_order_events WHERE order_id=$1) AS events,
              (SELECT count(*)::int FROM platform_notifications WHERE reference_id=$1) AS notifications,
              (SELECT count(*)::int FROM audit_logs
                 WHERE event_type='fulfillment.order.status_changed'
                   AND correlation_id=$2) AS audits`,
          [orderId, orderId + ':quoted:merchant_confirmed'],
        )).rows;
        return { order, effects };
      };
      assert.equal((await read('/api/v1/orders/mine')).status, 401);
      const owned = await read('/api/v1/orders/mine', cookies[0]);
      assert.equal(owned.status, 200);
      const list = await owned.json() as { orders: { id: string }[] };
      assert.equal(list.orders.some(o => o.id === orderId), true);
      const stranger = await read('/api/v1/orders/mine', cookies[2]);
      assert.equal(stranger.status, 200);
      assert.deepEqual((await stranger.json() as { orders: unknown[] }).orders, []);
      const merchantOrdersPath = '/api/v1/orders/merchant?businessId=' + merchantId;
      const merchantOrders = await read(merchantOrdersPath, cookies[1]);
      assert.equal(merchantOrders.status, 200);
      assert.equal((await merchantOrders.json() as { orders: { id: string }[] }).orders.some(o => o.id === orderId), true);
      assert.equal((await read(merchantOrdersPath)).status, 401, 'anonymous cannot read merchant orders');
      assert.equal((await read(merchantOrdersPath, cookies[0])).status, 403, 'customer cannot impersonate merchant');
      assert.equal((await read(merchantOrdersPath, cookies[2])).status, 403, 'unrelated user cannot read merchant orders');
      assert.equal((await read('/api/v1/orders/courier?businessId=' + merchantId, cookies[1])).status, 403,
        'merchant account is not automatically a courier account');
      assert.equal((await read('/api/v1/orders/' + orderId + '/tracking', cookies[2])).status, 403,
        'unrelated user cannot inspect order tracking');
      assert.equal((await read('/api/v1/orders/' + orderId + '/tracking', cookies[0])).status, 200);
      assert.equal((await read('/api/v1/auth/session', cookies[0])).status, 200);
      const reviewed = { updatedAt: originalRevision, total: 1200, currency: 'SYP' };
      const initial = await snapshot();
      assert.equal((await patch(cookies[2], {status:'merchant_confirmed',expectedQuote:reviewed})).status, 403);
      assert.equal((await patch(cookies[1], {status:'merchant_confirmed',expectedQuote:reviewed})).status, 400,
        'merchant cannot impersonate customer confirmation');
      assert.equal((await patch('', {status:'merchant_confirmed',expectedQuote:reviewed})).status, 401,
        'anonymous confirmation must not succeed');
      const crossOrigin = await fetch(origin + '/api/v1/orders/' + orderId + '/status', {
        method: 'PATCH',
        headers: { Cookie: cookies[0], Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'merchant_confirmed', expectedQuote: reviewed }),
      });
      assert.equal(crossOrigin.status, 403, 'untrusted browser origin cannot confirm a quote');
      assert.equal((await patch(cookies[0], {status:'merchant_confirmed'})).status, 400);
      assert.equal((await patch(cookies[0], {status:'merchant_confirmed',
        expectedQuote:{...reviewed,total:1199}})).status, 409);
      assert.deepEqual(await snapshot(), initial, 'rejections must not mutate persisted state');

      // Simulate a merchant revising the persisted quote after customer review.
      const nextRevision = '2026-11-16T12:00:03.000Z';
      await pool.query(
        'UPDATE fulfillment_orders SET total=1250, delivery_fee=250, updated_at=$2 WHERE id=$1',
        [orderId, nextRevision],
      );
      const afterRequote = await snapshot();
      assert.equal((await patch(cookies[0], {status:'merchant_confirmed',expectedQuote:reviewed})).status, 409);
      assert.deepEqual(await snapshot(), afterRequote, 'stale review must not create side effects');
      const valid = await patch(cookies[0], {
        status:'merchant_confirmed',
        expectedQuote:{updatedAt:nextRevision,total:1250,currency:'SYP'},
      });
      assert.equal(valid.status, 200, await valid.text().catch(()=>''));
      const confirmed = await snapshot();
      assert.equal(confirmed.order.status, 'merchant_confirmed');
      assert.deepEqual(confirmed.effects, {events:1,notifications:1,audits:1});
      const replay = await patch(cookies[0], {
        status:'merchant_confirmed',
        expectedQuote:{updatedAt:nextRevision,total:1250,currency:'SYP'},
      });
      assert.equal(replay.status, 400);
      assert.deepEqual(await snapshot(), confirmed, 'replay must be idempotently rejected');
      console.log('SIGNED_HTTP_REVIEWED_QUOTE_PG037_ACCEPTANCE_PASSED');
    } finally {
      try { await app?.close(); } finally {
        await pool.end();
        for (const [key, value] of Object.entries(former)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  },
);
