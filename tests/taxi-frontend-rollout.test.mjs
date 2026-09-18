import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../apps/frontend/app/taxi/page.tsx', import.meta.url), 'utf8');
const dockerfile = await readFile(new URL('../Dockerfile.frontend', import.meta.url), 'utf8');

test('Taxi trip UI is fail-closed behind a browser-safe build flag', () => {
  assert.match(page, /NEXT_PUBLIC_TAXI_TRIPS_ENABLED === 'true'/);
  assert.match(page, /!TAXI_TRIPS_ENABLED/);
  assert.match(page, /التفعيل التشغيلي للرحلات/);
  assert.match(page, /مخطط الرحلات التشغيلي/);
  assert.match(dockerfile, /ARG NEXT_PUBLIC_TAXI_TRIPS_ENABLED=false/);
  assert.match(dockerfile, /NEXT_PUBLIC_TAXI_TRIPS_ENABLED=\$NEXT_PUBLIC_TAXI_TRIPS_ENABLED/);
});
