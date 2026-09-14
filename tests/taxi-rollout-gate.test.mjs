import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Taxi operational UI stays hidden unless the server explicitly enables trips', async () => {
  const [layout, service] = await Promise.all([
    read('apps/frontend/app/taxi/layout.tsx'),
    read('apps/backend/src/taxi/taxi-trip.service.ts')
  ]);

  assert.match(layout, /export const dynamic = 'force-dynamic'/);
  assert.match(layout, /process\.env\.TAXI_TRIPS_ENABLED === 'true'/);
  assert.match(layout, /\/mobility\?type=taxi/);
  assert.match(layout, /الرحلات التشغيلية غير مفعلة/);
  assert.match(service, /process\.env\.TAXI_TRIPS_ENABLED!=='true'/);
});

test('Preview and Staging enable canonical Taxi access authority while trip execution stays fail closed', async () => {
  const [deploy, accessSql, tripsSql, canonicalApproval, migrator] = await Promise.all([
    read('scripts/deployment/deploy-cloud-run-environment.sh'),
    read('apps/backend/src/taxi/sql/access.candidate.sql'),
    read('apps/backend/src/taxi/sql/trips.candidate.sql'),
    read('backend/migrations/versions/031_taxi_operational_approvals.sql'),
    read('apps/backend/src/database/database.migrator.ts')
  ]);

  assert.ok(deploy.includes('TAXI_TRIPS_ENABLED="${TAXI_TRIPS_ENABLED:-false}"'));
  assert.ok(deploy.includes('Taxi trips cannot be enabled by this deployment path while the Taxi SQL remains candidate-only.'));
  assert.ok((deploy.match(/TAXI_TRIPS_ENABLED=\$\{TAXI_TRIPS_ENABLED\}/g) ?? []).length >= 2);
  assert.match(deploy, /TAXI_ACCESS_ENABLED=true/);
  assert.match(deploy, /ensure-taxi-operational-nonproduction-schema\.sh/);
  assert.match(canonicalApproval, /CREATE SCHEMA khedmah_taxi/);
  assert.match(canonicalApproval, /resolve_actor_locked/);
  assert.match(canonicalApproval, /driver_approvals/);
  assert.match(canonicalApproval, /vehicle_approvals/);
  assert.doesNotMatch(canonicalApproval, /CREATE TABLE[^;]*(taxi_trips|trip_offers|dispatch)/i);
  assert.match(accessSql, /CANDIDATE/);
  assert.match(tripsSql, /CANDIDATE ONLY/);
  assert.match(tripsSql, /Not registered with the migrator/);
  assert.doesNotMatch(migrator, /trips\.candidate|trip_offers/);
});