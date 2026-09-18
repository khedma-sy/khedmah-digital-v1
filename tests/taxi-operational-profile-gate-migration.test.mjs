import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration, rollback, runner, ensure, predecessorEnsure, deploy] = await Promise.all([
  read('backend/migrations/versions/032_taxi_operational_profile_gate.sql'),
  read('backend/migrations/versions/032_taxi_operational_profile_gate_rollback.sql'),
  read('scripts/deployment/run-taxi-operational-profile-gate-nonproduction-migration.sh'),
  read('scripts/deployment/ensure-taxi-operational-profile-gate-nonproduction-schema.sh'),
  read('scripts/deployment/ensure-taxi-operational-nonproduction-schema.sh'),
  read('scripts/deployment/deploy-cloud-run-environment.sh')
]);

test('Migration 032 binds driver authority to the current Taxi business profile', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION khedmah_taxi\.resolve_actor_locked/);
  assert.match(migration, /b public\.business_profiles%ROWTYPE/);
  assert.match(migration, /FROM public\.business_profiles bb/);
  assert.match(migration, /bb\.owner_user_id = a\.user_identifier/);
  assert.match(migration, /bb\.category_code = 'taxi'/);
  assert.match(migration, /b\.visibility <> 'public'/);
  assert.match(migration, /b\.moderation_status <> 'approved'/);
  assert.match(migration, /b\.trust_status <> 'approved'/);
  assert.match(migration, /b\.status <> 'active'/);
  assert.match(migration, /d\.business_profile_id <> b\.id/);
  assert.match(migration, /v\.business_profile_id <> b\.id/);
  assert.match(migration, /FOR SHARE/);
  assert.match(migration, /d\.expires_at <= pg_catalog\.clock_timestamp\(\)/);
  assert.match(migration, /v\.expires_at <= pg_catalog\.clock_timestamp\(\)/);
  assert.doesNotMatch(migration, /CREATE TABLE|DROP TABLE|TRUNCATE|DELETE FROM|TAXI_TRIPS_ENABLED\s*=\s*true/i);
});

test('Migration 032 rollback restores only the actor resolver and preserves Taxi approval data', () => {
  assert.match(rollback, /CREATE OR REPLACE FUNCTION khedmah_taxi\.resolve_actor_locked/);
  assert.doesNotMatch(rollback, /DROP TABLE|DROP SCHEMA|TRUNCATE|DELETE FROM/i);
  assert.doesNotMatch(rollback, /FROM public\.business_profiles bb/);
});

test('Migration 032 runner is POSIX-valid, checksum-bound and fail-closed', () => {
  const runnerPath = fileURLToPath(new URL('../scripts/deployment/run-taxi-operational-profile-gate-nonproduction-migration.sh', import.meta.url));
  const syntax = spawnSync('/bin/sh', ['-n', runnerPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || 'Migration 032 runner must parse as POSIX shell');
  assert.match(runner, /fd99e0cd9b3c7763ed938080f8526d7d7a38335343c6b2ec379bd2a35f3ad588/);
  assert.match(runner, /APPLY_KHEDMAH_NONPROD_032_/);
  assert.match(runner, /to_regclass\('public\.business_profiles'\)/);
  assert.match(runner, /to_regclass\('khedmah_taxi\.driver_approvals'\)/);
  assert.match(runner, /pg_get_functiondef/);
  assert.match(runner, /MIGRATION_032_ALREADY_APPLIED_AND_VERIFIED/);
  assert.match(runner, /MIGRATION_032_APPLIED_AND_VERIFIED/);
  assert.doesNotMatch(runner, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|printenv/i);
});

test('Migration 032 is pinned to its repository blob and isolated from Production', () => {
  assert.match(ensure, /fd99e0cd9b3c7763ed938080f8526d7d7a38335343c6b2ec379bd2a35f3ad588/);
  assert.match(ensure, /61b0a781714d4706b8edef1a6a711815e4720cbe/);
  assert.match(ensure, /Refusing Taxi operational profile-gate operation on the production project/);
  assert.match(ensure, /--max-retries 0/);
  assert.match(ensure, /--task-timeout 10m/);
  assert.match(ensure, /TAXI_032_FAILED_EXECUTION=/);
  assert.match(ensure, /--freshness=30m/);
  assert.match(ensure, /--limit=200/);
});

test('Migration 031 always chains Migration 032 before backend build', () => {
  assert.match(predecessorEnsure, /TAXI_OPERATIONAL_MIGRATION_032_MODE="\$mode"/);
  assert.match(predecessorEnsure, /ensure-taxi-operational-profile-gate-nonproduction-schema\.sh/);
  const operationalGate = deploy.indexOf('ensure-taxi-operational-nonproduction-schema.sh');
  const backendBuild = deploy.indexOf('cloudbuild.${environment}-backend.yaml');
  assert.ok(operationalGate >= 0 && backendBuild > operationalGate, 'Taxi operational authority and profile hardening must finish before backend build');
  assert.match(deploy, /TAXI_TRIPS_ENABLED="\$\{TAXI_TRIPS_ENABLED:-false\}"/);
  assert.match(deploy, /Taxi trips cannot be enabled by this deployment path while the Taxi SQL remains candidate-only/);
});
