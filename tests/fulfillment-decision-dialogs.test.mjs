import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [merchant, courier, courierDialog] = await Promise.all([
  read('apps/frontend/app/orders/merchant/page.tsx'),
  read('apps/frontend/app/orders/courier/page.tsx'),
  read('apps/frontend/app/orders/courier/courier-evidence-dialog.tsx')
]);

test('merchant pricing rejection and pharmacy review use internal dialogs, never browser prompt or confirm', () => {
  assert.doesNotMatch(merchant, /window\.(?:prompt|confirm)\s*\(/);
  assert.match(merchant, /role="dialog"/);
  assert.match(merchant, /رسوم التوصيل/);
  assert.match(merchant, /pharmacyApproved/);
  assert.match(merchant, /سبب رفض الطلب/);
  assert.match(merchant, /status==="courier_assigned"|"courier_assigned"/);
});

test('courier pickup and delivered evidence use an internal single-flight confirmation dialog', () => {
  assert.doesNotMatch(courier, /window\.confirm\s*\(/);
  assert.match(courier, /CourierEvidenceDialog/);
  assert.match(courier, /actionInFlight/);
  assert.match(courier, /status: "picked_up"/);
  assert.match(courier, /status: "delivered"/);
  assert.match(courierDialog, /role="dialog"/);
  assert.match(courierDialog, /استلام الطلب كاملًا فعليًا/);
  assert.match(courierDialog, /تسليم الطلب للعميل وتحصيل/);
});

test('delivery decisions still preserve the canonical fulfillment transitions', () => {
  assert.match(courier, /move\(o, "courier_accepted"\)/);
  assert.match(courier, /move\(o, "merchant_confirmed"\)/);
  assert.match(courier, /status: "picked_up"/);
  assert.match(courier, /status: "delivered"/);
  assert.match(merchant, /transition\(o,"courier_assigned"/);
  assert.match(merchant, /transition\(o,"ready_for_pickup"\)/);
});
