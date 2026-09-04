import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('migration 032 adds arrival, meter and governed platform fare policy',async()=>{
  const [forward,rollback]=await Promise.all([read('backend/migrations/versions/032_mobility_fare_lifecycle.sql'),read('backend/migrations/versions/032_mobility_fare_lifecycle_rollback.sql')]);
  for(const state of ['arrived','in_progress'])assert.match(forward,new RegExp(state));
  for(const field of ['route_distance_meters','waiting_seconds','base_fare','fare_per_km','fare_per_waiting_minute','fare_minimum','fare_policy_updated_at','distance_fare','waiting_fare','final_fare'])assert.match(forward,new RegExp(field));
  assert.match(forward,/CREATE TABLE mobility_fare_policies/);
  assert.match(forward,/NOT enabled OR/);
  for(const document of ['driver_photo','identity_card','driving_license','vehicle_license'])assert.match(forward,new RegExp(document));
  assert.match(rollback,/DROP TABLE IF EXISTS mobility_fare_policies/);
});

test('driver documents remain private and gate mobility approval',async()=>{
  const [validation,business,admin]=await Promise.all([read('apps/backend/src/media/media.validation.ts'),read('apps/backend/src/business-profiles/business-profile.service.ts'),read('apps/frontend/app/admin/moderation/page.tsx')]);
  assert.match(validation,/Driver verification documents must remain private/);
  assert.match(business,/countMobilityDocuments/);
  assert.match(business,/!==4/);
  assert.match(admin,/تدقيق الوثائق/);
});

test('mobility UI announces meter start and never lets the driver type a final fare',async()=>{
  const [rider,provider,service]=await Promise.all([read('apps/frontend/app/mobility/page.tsx'),read('apps/frontend/app/mobility/manage/page.tsx'),read('apps/backend/src/mobility/mobility.service.ts')]);
  assert.match(rider,/بدأت الرحلة والتسعير/);
  assert.match(rider,/وصل سائق خدمة/);
  assert.match(provider,/وصلت إلى العميل/);
  assert.match(provider,/ابدأ الرحلة والعداد/);
  assert.match(provider,/إنهاء وإصدار السعر/);
  assert.doesNotMatch(provider,/name=["']finalFare/);
  assert.match(service,/Math\.max\(request\.fareMinimum/);
});

test('smart admin monitors arrived and in-progress mobility requests',async()=>{
  const repository=await read('apps/backend/src/operations-product/operations-product.repository.ts');
  assert.match(repository,/status IN \('requested','accepted','en_route','arrived','in_progress'\)\) mobility_active/);
  assert.match(repository,/status IN \('requested','accepted','en_route','arrived','in_progress'\).*mobility_stale/);
});
