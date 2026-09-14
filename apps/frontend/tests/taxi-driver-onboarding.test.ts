import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('taxi driver onboarding is reachable outside the trip rollout gate', async () => {
  const layout = await read('app/taxi/layout.tsx');
  const page = await read('app/taxi-driver-signup/page.tsx');

  assert.match(layout, /href="\/taxi-driver-signup"/);
  assert.match(layout, /Driver registration\/document review remains available/);
  assert.match(page, /title="سجّل سيارتك مع خدمة"/);
  assert.match(page, /categoryCode: 'taxi'/);
});

test('driver documents stay private and cover the four governed review types', async () => {
  const page = await read('app/taxi-driver-signup/page.tsx');
  for (const type of ['driver_photo', 'identity_card', 'driving_license', 'vehicle_license']) {
    assert.match(page, new RegExp(`type: '${type}'`));
  }
  assert.match(page, /ownerType: 'business_profile'/);
  assert.match(page, /visibility: 'private'/);
  assert.match(page, /\/api\/v1\/driver-documents\/business\//);
  assert.match(page, /reviewStatus: 'pending' \| 'approved' \| 'rejected'/);
});

test('onboarding never self-authorizes Taxi execution', async () => {
  const page = await read('app/taxi-driver-signup/page.tsx');
  const client = await read('lib/taxi-client.ts');

  assert.match(page, /لا تنشئ موافقة تشغيلية تلقائياً/);
  assert.match(page, /اعتماد السائق والمركبة والمنطقة داخل محرك Taxi/);
  assert.doesNotMatch(page, /driver_approvals|vehicle_approvals|approved_at|verification_reference/);
  assert.doesNotMatch(client, /registerDriver|approveDriver|approveVehicle|vehicle_approvals|driver_approvals/);
});
