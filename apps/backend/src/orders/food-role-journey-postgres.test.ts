import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';
import { DriverDocumentReviewController } from '../media/driver-document-review.controller';
import { DriverDocumentReviewService } from '../media/driver-document-review.service';
import { createCsrfOriginMiddleware } from '../middleware/csrf-origin.middleware';
import { NotificationController } from '../notifications/notification.controller';
import { NotificationRepository } from '../notifications/notification.repository';
import { NotificationService } from '../notifications/notification.service';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';

type Actor = 'customer' | 'merchant' | 'courier' | 'reviewer' | 'outsider';

// Disposable PostgreSQL, synthetic documents and loopback HTTP only. This proves
// server authority and persistence; it does not certify people, GPS or cash.
test('food delivery role journey uses canonical sessions, governed review and atomic persistence', { timeout: 90_000 }, async () => {
  const saved = {
    origin: process.env.CORS_ORIGIN,
    roles: process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS,
    mode: process.env.NODE_ENV,
  };
  const originHeader = 'https://role-journey.example.test';
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const identities = new IdentityRepository(db);
  const tokens = new SessionTokenService();
  const identity = new IdentityService(identities, tokens);
  const businesses = new BusinessProfileRepository(db);
  const orders = new OrderRepository(db);
  const orderService = new OrderService(orders, businesses, identity);
  const notificationRepository = new NotificationRepository(db);
  const notifications = new NotificationService(notificationRepository, identity);
  const reviewerEmail = 'role-reviewer@example.test';
  let documentService: DriverDocumentReviewService;
  const people: Record<Actor, string> = {
    customer: randomUUID(), merchant: randomUUID(), courier: randomUUID(), reviewer: randomUUID(), outsider: randomUUID(),
  };
  const sessions = Object.fromEntries(Object.keys(people).map(name => [name, tokens.createToken()])) as Record<Actor, string>;
  const merchantBusinessId = randomUUID(), courierBusinessId = randomUUID(), otherCityCourierId = randomUUID(), productId = randomUUID();
  const documentIds: Record<string, string[]> = { [courierBusinessId]: [], [otherCityCourierId]: [] };
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;

  try {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGIN = originHeader;
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ [reviewerEmail]: ['security_operations_engineer'] });
    documentService = new DriverDocumentReviewService(db, identity, new OperationsRbacService());
    await resetCanonicalTestSchema(pool);
    for (const migration of ['024_product_store', '025_classifieds', '026_cash_fulfillment_orders', '027_mobility_document_reviews', '028_platform_notifications']) {
      await pool.query(await readFile(resolve(__dirname, '../../../../backend/migrations/versions', `${migration}.sql`), 'utf8'));
    }
    const now = new Date().toISOString();
    for (const actor of Object.keys(people) as Actor[]) {
      const id = people[actor], email = actor === 'reviewer' ? reviewerEmail : `${actor}@example.test`;
      await identities.saveAccount({ id, email, passwordHash: 'synthetic-nonlogin-hash', status: 'active', createdAt: now, updatedAt: now });
      await identities.saveProfile({ userId: id, displayName: `Role ${actor}`, locale: 'ar', createdAt: now, updatedAt: now });
      await identities.saveSession({ id: randomUUID(), userId: id, tokenHash: tokens.hashToken(sessions[actor]), expiresAt: tokens.expiresAt(), createdAt: now });
    }
    await pool.query(
      `INSERT INTO business_profiles(id,name,owner_user_id,category_code,city_code,country_code,visibility,moderation_status,trust_status,status,phone,address_ar)
       VALUES($1,'مطعم اختبار الأدوار',$2,'restaurant','damascus','SY','public','approved','approved','active','0111111111','دمشق'),
             ($3,'مندوب دمشق',$4,'delivery_courier','damascus','SY','public','approved','approved','active','0222222222','دمشق'),
             ($5,'مندوب حلب',$4,'delivery_courier','aleppo','SY','public','approved','approved','active','0333333333','حلب')`,
      [merchantBusinessId, people.merchant, courierBusinessId, people.courier, otherCityCourierId],
    );
    await pool.query(
      `INSERT INTO product_listings(id,business_profile_id,owner_user_id,title_ar,price,currency,category_code,availability,status,moderation_status)
       VALUES($1,$2,$3,'وجبة اختبار',1000,'SYP','restaurant','in_stock','active','approved')`,
      [productId, merchantBusinessId, people.merchant],
    );
    for (const businessId of [courierBusinessId, otherCityCourierId]) {
      for (const documentType of ['driver_photo', 'identity_card', 'driving_license', 'vehicle_license']) {
        const id = randomUUID(); documentIds[businessId].push(id);
        await pool.query(
          `INSERT INTO media_assets(id,owner_user_id,owner_type,owner_id,filename,mime_type,size_bytes,visibility,storage_key,asset_type)
           VALUES($1,$2,'business_profile',$3,$4,'image/png',1,'private',$5,$6)`,
          [id, people.courier, businessId, `${documentType}.png`, `synthetic/${id}`, documentType],
        );
      }
    }

    @Module({
      controllers: [OrderController, DriverDocumentReviewController, NotificationController],
      providers: [
        { provide: OrderService, useValue: orderService },
        { provide: DriverDocumentReviewService, useValue: documentService },
        { provide: NotificationService, useValue: notifications },
      ],
    })
    class AcceptanceModule {}
    app = await NestFactory.create(AcceptanceModule, { logger: false });
    app.use(createCsrfOriginMiddleware());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const origin = `http://127.0.0.1:${address.port}`;

    async function request<T>(path: string, actor: Actor, options: { method?: string; body?: unknown; expected?: number; headers?: Record<string, string> } = {}) {
      const response = await fetch(`${origin}/api/v1${path}`, {
        method: options.method ?? 'GET',
        headers: {
          cookie: `khedmah_session=${sessions[actor]}`,
          origin: originHeader,
          'content-type': 'application/json',
          'x-role': 'bootstrap_admin',
          ...options.headers,
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const expected = options.expected ?? 200;
      const raw = await response.text();
      assert.equal(response.status, expected, `${path}: ${response.status} ${raw}`);
      if (expected < 400) {
        assert.match(response.headers.get('cache-control') ?? '', /private,\s*no-store/);
        assert.match(response.headers.get('vary') ?? '', /Cookie/i);
      }
      return raw ? JSON.parse(raw) as T : undefined as T;
    }

    await request('/driver-documents/review-queue', 'outsider', { expected: 403 });
    await request('/driver-documents/review-queue', 'merchant', { expected: 403 });
    const initialQueue = await request<{ businesses: Array<{ businessProfileId: string; pendingDocuments: number }> }>('/driver-documents/review-queue', 'reviewer');
    assert.deepEqual(new Set(initialQueue.businesses.map(item => item.businessProfileId)), new Set([courierBusinessId, otherCityCourierId]));
    assert.ok(initialQueue.businesses.every(item => item.pendingDocuments === 4));
    const beforeReview = await request<{ couriers: unknown[]; total: number }>(`/orders/eligible-couriers?businessId=${merchantBusinessId}`, 'merchant');
    assert.equal(beforeReview.total, 0);
    for (const id of [...documentIds[courierBusinessId], ...documentIds[otherCityCourierId]]) {
      await request(`/driver-documents/${id}/review`, 'reviewer', { method: 'POST', body: { status: 'approved' }, expected: 201 });
    }
    const afterReview = await request<{ couriers: Array<{ id: string; cityCode: string }>; total: number }>(`/orders/eligible-couriers?businessId=${merchantBusinessId}`, 'merchant');
    assert.equal(afterReview.total, 1); assert.deepEqual(afterReview.couriers, [{ id: courierBusinessId, name: 'مندوب دمشق', cityCode: 'damascus' }]);

    const idempotencyKey = randomUUID();
    const createBody = { items: [{ productListingId: productId, quantity: 2 }], deliveryAddress: 'دمشق المزة اختبار', customerPhone: '0999999999', deliveryLatitude: 33.51, deliveryLongitude: 36.29 };
    await pool.query(`ALTER TABLE platform_notifications ADD CONSTRAINT synthetic_create_notification_failure CHECK (title <> 'طلب جديد')`);
    try {
      await request('/orders', 'customer', { method: 'POST', body: createBody, expected: 500, headers: { 'idempotency-key': randomUUID() } });
      const rolledBack = (await pool.query(`SELECT (SELECT count(*)::int FROM fulfillment_orders) orders,(SELECT count(*)::int FROM fulfillment_order_events) events,(SELECT count(*)::int FROM audit_logs WHERE event_type LIKE 'fulfillment.%') audits`)).rows[0];
      assert.deepEqual(rolledBack, { orders: 0, events: 0, audits: 0 });
    } finally {
      await pool.query('ALTER TABLE platform_notifications DROP CONSTRAINT synthetic_create_notification_failure');
    }
    const [created, replay] = await Promise.all([
      request<{ order: Record<string, unknown> }>('/orders', 'customer', { method: 'POST', body: createBody, expected: 201, headers: { 'idempotency-key': idempotencyKey } }),
      request<{ order: Record<string, unknown> }>('/orders', 'customer', { method: 'POST', body: createBody, expected: 201, headers: { 'idempotency-key': idempotencyKey } }),
    ]);
    assert.equal(created.order.id, replay.order.id); assert.equal(created.order.paymentMethod, 'cash'); assert.equal(created.order.status, 'placed');
    assert.equal('customerUserId' in created.order, false); assert.equal('customerPhone' in created.order, false);
    const orderId = String(created.order.id);

    const stalePlacedOrder = await orders.findById(orderId);
    assert.ok(stalePlacedOrder);
    await pool.query(`UPDATE business_profiles SET owner_user_id=$2 WHERE id=$1`, [merchantBusinessId, people.outsider]);
    assert.deepEqual(await orders.listForMerchant(merchantBusinessId, people.merchant), []);
    assert.equal((await orders.trackingForActor(orderId, people.merchant))?.authorized, false);
    assert.equal(await orders.transition(stalePlacedOrder, 'quoted', people.merchant, { authority: 'merchant', deliveryFee: 250 }), undefined);
    await pool.query(`UPDATE business_profiles SET owner_user_id=$2 WHERE id=$1`, [merchantBusinessId, people.merchant]);

    await request(`/orders/merchant?businessId=${merchantBusinessId}`, 'outsider', { expected: 403 });
    let merchantOrders = await request<{ orders: Array<Record<string, unknown>> }>(`/orders/merchant?businessId=${merchantBusinessId}`, 'merchant');
    assert.equal(merchantOrders.orders[0].customerPhone, '0999999999');
    await request(`/orders/${orderId}/status`, 'merchant', { method: 'PATCH', body: { status: 'quoted', deliveryFee: 250 } });
    await pool.query(`ALTER TABLE platform_notifications ADD CONSTRAINT synthetic_transition_notification_failure CHECK (title <> 'تم تأكيد الطلب')`);
    try {
      await request(`/orders/${orderId}/status`, 'customer', { method: 'PATCH', body: { status: 'merchant_confirmed' }, expected: 500 });
      const rolledBack = (await pool.query(`SELECT status,(SELECT count(*)::int FROM fulfillment_order_events WHERE order_id=$1) events,(SELECT count(*)::int FROM audit_logs WHERE correlation_id=$1 OR correlation_id LIKE $1 || ':%') audits FROM fulfillment_orders WHERE id=$1`, [orderId])).rows[0];
      assert.deepEqual(rolledBack, { status: 'quoted', events: 2, audits: 2 });
    } finally {
      await pool.query('ALTER TABLE platform_notifications DROP CONSTRAINT synthetic_transition_notification_failure');
    }
    await request(`/orders/${orderId}/status`, 'customer', { method: 'PATCH', body: { status: 'merchant_confirmed' } });
    await request(`/orders/${orderId}/status`, 'merchant', { method: 'PATCH', body: { status: 'courier_assigned', courierBusinessId: otherCityCourierId }, expected: 400 });
    await request(`/orders/${orderId}/status`, 'merchant', { method: 'PATCH', body: { status: 'courier_assigned', courierBusinessId } });

    // Recreate a reassignment race at the repository boundary: a stale action
    // for the former courier must neither accept nor clear the new assignment.
    const staleAssignedOrder = await orders.findById(orderId);
    assert.ok(staleAssignedOrder);
    await pool.query(`UPDATE business_profiles SET owner_user_id=$2 WHERE id=$1`, [courierBusinessId, people.outsider]);
    assert.deepEqual(await orders.listForCourier(courierBusinessId, people.courier), []);
    assert.equal((await orders.trackingForActor(orderId, people.courier))?.authorized, false);
    assert.equal(await orders.transition(staleAssignedOrder, 'courier_accepted', people.courier, {
      authority: 'courier', eligibleCourierBusinessId: courierBusinessId, expectedCourierBusinessId: courierBusinessId,
    }), undefined);
    await pool.query(`UPDATE business_profiles SET owner_user_id=$2 WHERE id=$1`, [courierBusinessId, people.courier]);
    await pool.query(`UPDATE fulfillment_orders SET courier_business_id=$2 WHERE id=$1`, [orderId, otherCityCourierId]);
    assert.equal(await orders.transition(staleAssignedOrder, 'courier_accepted', people.courier, {
      authority: 'courier',
      eligibleCourierBusinessId: courierBusinessId,
      expectedCourierBusinessId: courierBusinessId,
    }), undefined);
    assert.equal(await orders.transition(staleAssignedOrder, 'merchant_confirmed', people.courier, {
      authority: 'courier',
      clearCourierBusinessId: true,
      expectedCourierBusinessId: courierBusinessId,
    }), undefined);
    const raceEvidence = (await pool.query(
      `SELECT status,courier_business_id,(SELECT count(*)::int FROM fulfillment_order_events WHERE order_id=$1) events
       FROM fulfillment_orders WHERE id=$1`, [orderId],
    )).rows[0];
    assert.deepEqual(raceEvidence, { status: 'courier_assigned', courier_business_id: otherCityCourierId, events: 4 });
    await pool.query(`UPDATE fulfillment_orders SET courier_business_id=$2 WHERE id=$1`, [orderId, courierBusinessId]);

    await request(`/orders/${orderId}/status`, 'courier', { method: 'PATCH', body: { status: 'merchant_confirmed', reason: 'تعذر تنفيذ المهمة' } });
    const declineNotifications = await pool.query<{ title: string; body: string }>(
      `SELECT title,body FROM platform_notifications WHERE reference_id=$1 AND title='جاري اختيار مندوب آخر' ORDER BY user_id`, [orderId],
    );
    assert.equal(declineNotifications.rowCount, 2);
    assert.ok(declineNotifications.rows.every(item => item.body.includes('مندوب آخر')));
    await request(`/orders/${orderId}/status`, 'merchant', { method: 'PATCH', body: { status: 'courier_assigned', courierBusinessId } });

    await request(`/orders/courier?businessId=${courierBusinessId}`, 'outsider', { expected: 403 });
    let courierOrders = await request<{ orders: Array<Record<string, unknown>> }>(`/orders/courier?businessId=${courierBusinessId}`, 'courier');
    assert.equal(courierOrders.orders[0].status, 'courier_assigned'); assert.equal('customerPhone' in courierOrders.orders[0], false);
    const renewedLicense = randomUUID();
    await pool.query(
      `INSERT INTO media_assets(id,owner_user_id,owner_type,owner_id,filename,mime_type,size_bytes,visibility,storage_key,asset_type,created_at,updated_at)
       VALUES($1,$2,'business_profile',$3,'renewed-license.png','image/png',1,'private',$4,'driving_license',NOW()+INTERVAL '1 second',NOW()+INTERVAL '1 second')`,
      [renewedLicense, people.courier, courierBusinessId, `synthetic/${renewedLicense}`],
    );
    await request(`/orders/${orderId}/status`, 'courier', { method: 'PATCH', body: { status: 'courier_accepted' }, expected: 400 });
    await request(`/driver-documents/${renewedLicense}/review`, 'reviewer', { method: 'POST', body: { status: 'approved' }, expected: 201 });
    await request(`/orders/${orderId}/status`, 'courier', { method: 'PATCH', body: { status: 'courier_accepted' } });
    courierOrders = await request<{ orders: Array<Record<string, unknown>> }>(`/orders/courier?businessId=${courierBusinessId}`, 'courier');
    assert.equal(courierOrders.orders[0].customerPhone, '0999999999');
    await request(`/orders/${orderId}/status`, 'merchant', { method: 'PATCH', body: { status: 'ready_for_pickup' } });
    await request(`/orders/${orderId}/status`, 'courier', { method: 'PATCH', body: { status: 'picked_up' } });
    const pickedOrder = await orders.findById(orderId);
    assert.ok(pickedOrder);
    await pool.query(`UPDATE business_profiles SET owner_user_id=$2 WHERE id=$1`, [courierBusinessId, people.outsider]);
    assert.equal(await orders.recordLocation(pickedOrder, people.courier, 33.52, 36.3, 9), false);
    await pool.query(`UPDATE business_profiles SET owner_user_id=$2 WHERE id=$1`, [courierBusinessId, people.courier]);
    await request(`/orders/${orderId}/location`, 'courier', { method: 'POST', body: { latitude: 33.52, longitude: 36.3, accuracy: 9 }, expected: 201 });
    const tracking = await request<{ status: string; location: { latitude: number } }>(`/orders/${orderId}/tracking`, 'customer');
    assert.equal(tracking.status, 'picked_up'); assert.equal(tracking.location.latitude, 33.52);
    await request(`/orders/${orderId}/tracking`, 'outsider', { expected: 403 });
    await request(`/orders/${orderId}/status`, 'courier', { method: 'PATCH', body: { status: 'delivered' } });
    const closedTracking = await request<{ status: string; location?: unknown }>(`/orders/${orderId}/tracking`, 'customer');
    assert.equal(closedTracking.status, 'delivered'); assert.equal(closedTracking.location, undefined);
    await request(`/orders/${orderId}/ratings`, 'customer', { method: 'POST', body: { targetType: 'merchant', score: 5 }, expected: 201 });
    await request(`/orders/${orderId}/ratings`, 'customer', { method: 'POST', body: { targetType: 'courier', score: 5 }, expected: 201 });
    merchantOrders = await request<{ orders: Array<Record<string, unknown>> }>(`/orders/merchant?businessId=${merchantBusinessId}`, 'merchant');
    assert.equal(merchantOrders.orders[0].paymentStatus, 'cash_collected'); assert.equal(merchantOrders.orders[0].total, 2250);

    const customerNotifications = await request<{ notifications: Array<{ referenceId: string }> }>('/notifications?limit=100', 'customer');
    assert.ok(customerNotifications.notifications.some(item => item.referenceId === orderId));
    const databaseEvidence = (await pool.query(
      `SELECT
        (SELECT count(*)::int FROM fulfillment_orders WHERE id=$1) orders,
        (SELECT count(*)::int FROM fulfillment_order_events WHERE order_id=$1) events,
        (SELECT count(*)::int FROM fulfillment_order_ratings WHERE order_id=$1) ratings,
        (SELECT count(*)::int FROM fulfillment_order_location_updates WHERE order_id=$1) locations,
        (SELECT count(*)::int FROM platform_notifications WHERE reference_id=$1) notifications,
        (SELECT count(*)::int FROM audit_logs WHERE correlation_id=$1 OR correlation_id LIKE $1 || ':%') audits`, [orderId],
    )).rows[0];
    assert.deepEqual(databaseEvidence, { orders: 1, events: 10, ratings: 2, locations: 1, notifications: 17, audits: 10 });
    const transitions = await pool.query<{ from_status: string | null; to_status: string; actor_user_id: string }>(
      `SELECT from_status,to_status,actor_user_id FROM fulfillment_order_events WHERE order_id=$1`, [orderId],
    );
    const transitionEvidence = transitions.rows.map(row => `${row.from_status ?? 'null'}>${row.to_status}:${row.actor_user_id}`).sort();
    assert.deepEqual(transitionEvidence, [
      `null>placed:${people.customer}`,
      `placed>quoted:${people.merchant}`,
      `quoted>merchant_confirmed:${people.customer}`,
      `merchant_confirmed>courier_assigned:${people.merchant}`,
      `courier_assigned>merchant_confirmed:${people.courier}`,
      `merchant_confirmed>courier_assigned:${people.merchant}`,
      `courier_assigned>courier_accepted:${people.courier}`,
      `courier_accepted>ready_for_pickup:${people.merchant}`,
      `ready_for_pickup>picked_up:${people.courier}`,
      `picked_up>delivered:${people.courier}`,
    ].sort());
    console.log('FOOD_ROLE_JOURNEY_EVIDENCE', JSON.stringify({ ...databaseEvidence, finalStatus: 'delivered', paymentStatus: 'cash_collected', liveGpsOrCashCertified: false }));
  } finally {
    if (app) await app.close();
    await pool.end();
    if (saved.origin === undefined) delete process.env.CORS_ORIGIN; else process.env.CORS_ORIGIN = saved.origin;
    if (saved.roles === undefined) delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS; else process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = saved.roles;
    if (saved.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.mode;
  }
});
