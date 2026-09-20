import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('courier discovery and atomic assignment require live availability and free capacity', async () => {
  const repository = await read('apps/backend/src/orders/order.repository.ts');
  const service = await read('apps/backend/src/orders/order.service.ts');

  assert.match(repository, /b\.availability='available'/);
  assert.match(repository, /NOT EXISTS \(\s*SELECT 1 FROM fulfillment_orders active_job/);
  assert.match(repository, /active_job\.id<>fulfillment_orders\.id/);
  assert.match(repository, /eligible\.availability='available'/);
  assert.match(service, /courier\.availability !== "available"/);
  assert.match(repository, /NOT \$14::boolean OR eligible\.availability='available'/);
  assert.match(service, /assertCourierEligible\(o\.courierBusinessId, o\.merchantBusinessId, false\)/);
});

test('merchant recall is concurrency guarded and retains an event reason', async () => {
  const validation = await read('apps/backend/src/orders/order.validation.ts');
  const service = await read('apps/backend/src/orders/order.service.ts');
  const repository = await read('apps/backend/src/orders/order.repository.ts');
  const merchant = await read('apps/frontend/app/orders/merchant/page.tsx');

  assert.match(validation, /expectedCourierBusinessId/);
  assert.match(service, /action\.expectedCourierBusinessId !== o\.courierBusinessId/);
  assert.match(service, /clearCourierBusinessId: true/);
  assert.match(repository, /formerCourierOwner/);
  assert.match(repository, /INSERT INTO fulfillment_order_events/);
  assert.match(repository, /DELETE FROM fulfillment_order_location_updates WHERE order_id=\$1/);
  assert.match(repository, /courier_business_id=o\.courier_business_id/);
  assert.match(repository, /confirmed_at=CASE WHEN \$2='quoted' AND \$3='merchant_confirmed'/);
  assert.match(service, /\["courier_assigned", "courier_accepted", "ready_for_pickup"\]\.includes\(o\.status\)/);
  assert.match(merchant, /سحب المهمة وتغيير المندوب/);
});

test('all order actors receive the persisted event timeline', async () => {
  const repository = await read('apps/backend/src/orders/order.repository.ts');
  const client = await read('apps/frontend/lib/recovered-service-client.ts');
  const customer = await read('apps/frontend/app/orders/page.tsx');
  const merchant = await read('apps/frontend/app/orders/merchant/page.tsx');
  const courier = await read('apps/frontend/app/orders/courier/page.tsx');
  const timeline = await read('apps/frontend/app/orders/order-timeline.tsx');

  assert.match(repository, /async eventsFor/);
  assert.match(client, /FulfillmentOrderEvent/);
  assert.match(timeline, /أُعيد الطلب لاختيار مندوب آخر/);
  for (const page of [customer, merchant, courier]) assert.match(page, /OrderTimeline/);
});
