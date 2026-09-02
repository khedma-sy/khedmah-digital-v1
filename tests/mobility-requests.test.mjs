import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('migration 025 creates a bounded auditable mobility lifecycle without payments or live tracking', async () => {
  const [migration, rollback] = await Promise.all([read('backend/migrations/versions/025_mobility_requests.sql'), read('backend/migrations/versions/025_mobility_requests_rollback.sql')]);
  assert.match(migration, /CREATE TABLE mobility_requests/);
  assert.match(migration, /CREATE TABLE mobility_request_events/);
  assert.match(migration, /mobility_requests_one_open_per_rider_idx/);
  assert.match(migration, /mobility_requests_rider_idempotency_unique/);
  for (const status of ['requested','accepted','en_route','completed','rejected','cancelled']) assert.match(migration, new RegExp(status));
  assert.doesNotMatch(migration, /CREATE TABLE (?:payments|pricing|live_tracking|driver_locations)/i);
  assert.match(rollback, /DROP TABLE IF EXISTS mobility_request_events/);
});

test('mobility API is authenticated, rate limited, role-scoped and transition-audited', async () => {
  const [app, service, repository] = await Promise.all([read('apps/backend/src/app.ts'), read('apps/backend/src/mobility/mobility.service.ts'), read('apps/backend/src/mobility/mobility.repository.ts')]);
  assert.match(app, /mobility\.requests/);
  assert.match(service, /getCurrentUser/);
  assert.match(service, /providerTransitions/);
  assert.match(service, /riderTransitions/);
  assert.match(service, /You cannot request your own mobility business/);
  assert.match(repository, /WHERE id=\$1 AND status=\$2/);
  assert.match(repository, /INSERT INTO mobility_request_events/);
});
