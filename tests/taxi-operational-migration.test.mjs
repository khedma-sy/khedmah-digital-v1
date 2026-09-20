import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration, rollback, runner, ensure, deploy] = await Promise.all([
  read('backend/migrations/versions/031_taxi_operational_approvals.sql'),
  read('backend/migrations/versions/031_taxi_operational_approvals_rollback.sql'),
  read('scripts/deployment/run-taxi-operational-approval-nonproduction-migration.sh'),
  read('scripts/deployment/ensure-taxi-operational-nonproduction-schema.sh'),
  read('scripts/deployment/deploy-cloud-run-environment.sh')
]);

test('Migration 031 creates only canonical Taxi operational authority and never trip execution', () => {
  assert.match(migration, /CREATE SCHEMA khedmah_taxi/);
  for (const table of ['vehicle_approvals', 'driver_approvals', 'operational_approval_events']) {
    assert.match(migration, new RegExp(`CREATE TABLE khedmah_taxi\\.${table}`));
  }
  assert.match(migration, /business_profile_id TEXT NOT NULL/);
  assert.match(migration, /reviewed_by TEXT NOT NULL/);
  assert.match(migration, /CHECK \(reviewed_by <> driver_user_id\)/);
  assert.match(migration, /CHECK \(reviewed_by <> user_id\)/);
  assert.match(migration, /resolve_actor_locked\(session_hash TEXT, wants_driver BOOLEAN\)/);
  assert.match(migration, /taxi_operational_approval_events_append_only/);
  assert.doesNotMatch(migration, /CREATE TABLE[^;]*(taxi_trips|trip_offers|dispatch|meter_evidence|location_evidence)/i);
  assert.doesNotMatch(migration, /TAXI_TRIPS_ENABLED\s*=\s*true/i);
});

test('Migration 031 rollback owns only the operational authority objects', () => {
  assert.match(rollback, /DROP FUNCTION IF EXISTS khedmah_taxi\.resolve_actor_locked/);
  assert.match(rollback, /DROP TABLE IF EXISTS khedmah_taxi\.operational_approval_events/);
  assert.match(rollback, /DROP TABLE IF EXISTS khedmah_taxi\.driver_approvals/);
  assert.match(rollback, /DROP TABLE IF EXISTS khedmah_taxi\.vehicle_approvals/);
  assert.match(rollback, /DROP SCHEMA IF EXISTS khedmah_taxi/);
  assert.doesNotMatch(rollback, /CASCADE|DROP TABLE[^;]*(taxi_trips|identity_sessions|business_profiles)/i);
});

test('Migration 031 runner is POSIX-valid, checksum-bound and refuses partial state', () => {
  const runnerPath = fileURLToPath(new URL('../scripts/deployment/run-taxi-operational-approval-nonproduction-migration.sh', import.meta.url));
  const syntax = spawnSync('/bin/sh', ['-n', runnerPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || 'Migration 031 runner must parse as POSIX shell');
  assert.match(runner, /148dfe66ee1a2c838225a14fe90dcac51e8c7a87ee56d277275142e20bcc6f5b/);
  assert.match(runner, /partial_or_unverified\) exit 44/);
  assert.match(runner, /\[ "\$state" = 'not_applied' \] \|\| exit_for_state "\$state"/);
  assert.match(runner, /MIGRATION_031_FINGERPRINT:predecessor=\$\{predecessor\}:schema=\$\{schema_count\}:tables=\$\{table_count\}:functions=\$\{function_count\}:trigger=\$\{trigger_count\}:index=\$\{index_count\}/);
  assert.doesNotMatch(runner, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|printenv/i);
});

test('Migration 031 deployment is isolated, bounded and ordered before backend build', () => {
  assert.match(ensure, /Refusing Taxi operational schema operation on the production project/);
  assert.match(ensure, /e557c132d1dff6ea4aadedcb25978a1c2d7cf410/);
  assert.match(ensure, /TAXI_031_FAILED_EXECUTION=/);
  assert.match(ensure, /TAXI_031_CONTAINER_LOGS_BEGIN/);
  assert.match(ensure, /--freshness=30m/);
  assert.match(ensure, /--limit=200/);
  const gate = deploy.indexOf('bash scripts/deployment/ensure-taxi-operational-nonproduction-schema.sh');
  const backend = deploy.indexOf('cloudbuild.${environment}-backend.yaml');
  assert.ok(gate >= 0 && backend > gate, 'Migration 031 must finish before backend image build');
  assert.match(deploy, /TAXI_ACCESS_ENABLED=true/);
  assert.match(deploy, /TAXI_TRIPS_ENABLED="\$\{TAXI_TRIPS_ENABLED:-false\}"/);
  assert.match(deploy, /Taxi trips cannot be enabled by this deployment path while the Taxi SQL remains candidate-only/);
});
