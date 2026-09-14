import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('merchant route is a real restaurant command center backed by existing owner APIs', async () => {
  const page = await read('apps/frontend/app/orders/merchant/page.tsx');
  assert.match(page, /Restaurant Command Center/);
  assert.match(page, /api\.orders\.merchant/);
  assert.match(page, /api\.products\.listMine/);
  assert.match(page, /api\.businesses\.getOpeningHours/);
  assert.match(page, /api\.businesses\.setOpeningHours/);
  assert.match(page, /toggleProduct/);
  assert.match(page, /طلبات اليوم/);
  assert.match(page, /المبيعات المسلمة اليوم/);
  assert.doesNotMatch(page, /Math\.random|fakeViews|syntheticViews|simulatedOrders/);
});

test('restaurant command center keeps the existing order alert and courier assignment flows', async () => {
  const page = await read('apps/frontend/app/orders/merchant/page.tsx');
  for (const required of ['playOrderRing','requestOrderNotifications','courier_assigned','ready_for_pickup','rejected']) assert.match(page, new RegExp(required));
});
