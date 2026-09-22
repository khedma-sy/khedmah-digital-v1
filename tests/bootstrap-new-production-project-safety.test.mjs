import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = await readFile(new URL('../scripts/bootstrap-new-production-project.sh', import.meta.url), 'utf8');

test('bootstrap shell is syntactically valid', () => {
  execFileSync('bash', ['-n', 'scripts/bootstrap-new-production-project.sh'], { stdio: 'pipe' });
});

const section = (start, end) => {
  const s = script.indexOf(start);
  const e = script.indexOf(end, s + start.length);
  assert.ok(s >= 0 && e > s, `missing section ${start} -> ${end}`);
  return script.slice(s, e);
};

test('new-account bootstrap is exact-main locked and rejects the legacy Google project', () => {
  assert.match(script, /git fetch origin main/);
  assert.match(script, /test "\$CURRENT_SHA" = "\$MAIN_SHA"/);
  assert.match(script, /refusing to bootstrap the legacy Google project/);
  assert.ok(script.indexOf('test "$CURRENT_SHA" = "$MAIN_SHA"') < script.indexOf('case "$BOOTSTRAP_MODE"'));
});

test('mutating bootstrap confirmations are bound to both project and exact main SHA', () => {
  assert.match(script, /PREPARE_KHEDMAH_BOOTSTRAP_STATE_\$\{GOOGLE_CLOUD_PROJECT\}_\$\{SHA7\^\^\}/);
  assert.match(script, /APPLY_KHEDMAH_BOOTSTRAP_\$\{GOOGLE_CLOUD_PROJECT\}_\$\{SHA7\^\^\}/);
});

test('bootstrap exposes explicit prepare, plan, apply and verify phases', () => {
  assert.match(script, /BOOTSTRAP_MODE="\$\{BOOTSTRAP_MODE:-PLAN\}"/);
  for (const mode of ['PREPARE_STATE)', 'PLAN)', 'APPLY)', 'VERIFY)']) {
    assert.ok(script.includes(mode), `missing ${mode}`);
  }
  assert.doesNotMatch(script, /BOOTSTRAP_APPLY/);
});

test('PREPARE_STATE is the only phase allowed to mutate prerequisite APIs or state bucket', () => {
  const prepare = section('  PREPARE_STATE)', '\n  PLAN)');
  assert.match(prepare, /PREPARE_KHEDMAH_BOOTSTRAP_STATE_/);
  assert.match(prepare, /gcloud services enable/);
  assert.match(prepare, /gcloud storage buckets create/);
  assert.match(prepare, /gcloud storage buckets update/);
  assert.match(prepare, /refusing to mutate a Terraform state bucket owned by another Google Cloud project/);

  const plan = section('  PLAN)', '\n  APPLY)');
  const apply = section('  APPLY)', '\n  VERIFY)');
  const verify = section('  VERIFY)', '\n  *)');
  for (const readOnly of [plan, apply, verify]) {
    assert.doesNotMatch(readOnly, /gcloud services enable|gcloud storage buckets create|gcloud storage buckets update/);
  }
});

test('state bucket lookup distinguishes confirmed absence from IAM or API errors', () => {
  assert.match(script, /bucket_status\(\)/);
  assert.match(script, /NOT_FOUND\|not found\|404\|does not exist/);
  assert.match(script, /refusing to classify it as absent/);
  assert.match(script, /Terraform state bucket belongs to a different Google Cloud project/);
  assert.match(script, /public_access_prevention/);
  assert.match(script, /uniform_bucket_level_access/);
  assert.match(script, /versioning_enabled/);
});

test('canonical infrastructure values are passed explicitly into Terraform plan', () => {
  for (const assignment of [
    'artifact_registry_repository_id=khedmah-digital',
    'cloud_sql_instance_id=khedmah-v1-db',
    'cloud_sql_database_name=khedmah',
    'cloud_sql_tier=db-custom-1-3840',
    'runtime_service_account_id=khedmah-v1-runtime',
    'deployer_service_account_id=khedmah-v1-deployer',
    'build_service_account_id=khedmah-v1-build',
    'migration_service_account_id=khedmah-v1-migrator',
    'runtime_secret_names=['
  ]) assert.ok(script.includes(assignment), `missing explicit Terraform variable ${assignment}`);
});

test('saved bootstrap plan is bound to the active project region repository and main ref', () => {
  assert.match(script, /verify_plan_target\(\)/);
  for (const field of [
    'project_id',
    'region',
    'github_repository',
    'github_ref',
    'github_workflow_path',
    'artifact_registry_repository_id',
    'cloud_sql_instance_id',
    'cloud_sql_database_name',
    'cloud_sql_tier',
    'runtime_service_account_id',
    'deployer_service_account_id',
    'build_service_account_id',
    'migration_service_account_id',
    'github_additional_workflow_paths',
    'runtime_secret_names'
  ]) {
    assert.ok(script.includes(`.variables.${field}.value`), `missing plan target field ${field}`);
  }
  assert.match(script, /production-operator-new-account\.yml/);
  assert.match(script, /terraform-media-state-handoff\.yml/);
  assert.match(script, /GOOGLE_MAPS_SERVER_API_KEY/);
  assert.match(script, /db-custom-1-3840/);
  assert.match(script, /bootstrap plan target does not match the canonical project\/infrastructure\/WIF\/secret contract/);
  const plan = section('  PLAN)', '\n  APPLY)');
  const apply = section('  APPLY)', '\n  VERIFY)');
  assert.match(plan, /verify_plan_target "\$PLAN_JSON"/);
  assert.match(apply, /verify_plan_target "\$plan_json"/);
});

test('PLAN is non-mutating and persists a checksum-addressable reviewed plan', () => {
  const plan = section('  PLAN)', '\n  APPLY)');
  assert.match(plan, /terraform -chdir=infra\/iac\/bootstrap plan/);
  assert.match(plan, /BOOTSTRAP_PLAN_SHA256/);
  assert.match(plan, /sha256sum/);
  assert.match(plan, /terraform -chdir=infra\/iac\/bootstrap show -json/);
  assert.match(plan, /destructive bootstrap plan rejected/);
  assert.match(plan, /NO_APPLY/);
  assert.doesNotMatch(plan, /terraform -chdir=infra\/iac\/bootstrap apply/);
  assert.doesNotMatch(plan, /gcloud services enable|gcloud storage buckets create|gcloud storage buckets update/);
});

test('APPLY consumes only the saved approved plan and never replans', () => {
  const apply = section('  APPLY)', '\n  VERIFY)');
  assert.match(apply, /BOOTSTRAP_PLAN_FILE/);
  assert.match(apply, /BOOTSTRAP_PLAN_SHA256/);
  assert.match(apply, /bootstrap plan checksum mismatch/);
  assert.match(apply, /APPLY_KHEDMAH_BOOTSTRAP_/);
  assert.match(apply, /terraform -chdir=infra\/iac\/bootstrap apply/);
  assert.match(apply, /destructive bootstrap plan rejected at APPLY/);
  assert.doesNotMatch(apply, /terraform -chdir=infra\/iac\/bootstrap plan/);
});

test('VERIFY is read-only and publishes only sanitized Terraform outputs', () => {
  const verify = section('  VERIFY)', '\n  *)');
  assert.match(verify, /publish_outputs/);
  assert.match(verify, /VERIFIED: bootstrap state and sanitized outputs/);
  assert.doesNotMatch(verify, /terraform .* apply|gcloud services enable|buckets create|buckets update/);
  assert.match(script, /secret_ids: \.secret_ids\.value/);
});
