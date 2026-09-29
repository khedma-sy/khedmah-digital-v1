import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const script = await readFile(new URL('../scripts/plan-production-bootstrap-adoption-scratch.sh', import.meta.url), 'utf8');

test('scratch adoption planner is syntactically valid bash', () => {
  const result = spawnSync('bash', ['-n', 'scripts/plan-production-bootstrap-adoption-scratch.sh'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('scratch planner is pinned to canonical production source and identity', () => {
  assert.match(script, /CANONICAL_PROJECT="khedma-dl"/);
  assert.match(script, /CANONICAL_REGION="europe-west1"/);
  assert.match(script, /CANONICAL_REPOSITORY="khedma-sy\/khedmah-digital-v1"/);
  assert.match(script, /git fetch origin main --quiet/);
  assert.match(script, /test "\$CURRENT_SHA" = "\$MAIN_SHA"/);
  assert.match(script, /SCRATCH_BOOTSTRAP_ADOPTION_/);
});

test('scratch planner never connects Terraform to the remote GCS backend', () => {
  assert.match(script, /backend "local" \{ path = "scratch\.tfstate" \}/);
  assert.match(script, /remote GCS backend still present in scratch configuration/);
  assert.doesNotMatch(script, /-backend-config=/);
  assert.doesNotMatch(script, /terraform\s+-chdir=.*state\s+(push|mv|rm)/);
});

test('scratch planner has no cloud mutation or Terraform apply path', () => {
  assert.doesNotMatch(script, /terraform\s+[^\n]*\bapply\b/);
  assert.doesNotMatch(script, /gcloud\s+[^\n]*(add-iam-policy-binding|remove-iam-policy-binding|set-iam-policy|services enable|run deploy|builds submit|secrets versions add|sql users set-password)/);
  assert.doesNotMatch(script, /secrets versions access/);
  assert.match(script, /NO_REMOTE_STATE_MUTATION/);
  assert.match(script, /NO_CLOUD_MUTATION/);
  assert.match(script, /NO_APPLY/);
});

test('legacy runtime and deployer identities are never imported into canonical addresses', () => {
  assert.doesNotMatch(script, /import_resource\s+"google_service_account\.runtime"/);
  assert.doesNotMatch(script, /import_resource\s+"google_service_account\.deployer"/);
  assert.match(script, /Never import the legacy khedma-v1-runtime or khedma-v1-deployer/);
  assert.match(script, /SCRATCH_LIVE_ABSENT: service-account:runtime-canonical/);
  assert.match(script, /SCRATCH_LIVE_ABSENT: service-account:deployer-canonical/);
});

test('scratch planner adopts existing canonical structural resources only into local state', () => {
  for (const address of [
    'google_storage_bucket.cloudbuild_source',
    'google_sql_database_instance.postgres',
    'google_sql_database.application',
    'google_artifact_registry_repository.docker',
    'google_service_account.build',
    'google_service_account.migration',
    'google_project_iam_custom_role.storage_bucket_policy_viewer',
    'google_secret_manager_secret.database_migration',
    'google_secret_manager_secret.maps_android',
    'google_secret_manager_secret.bootstrap_admin',
    'google_iam_workload_identity_pool.github',
    'google_iam_workload_identity_pool_provider.github',
    'google_project_iam_member.migration_cloud_sql_client',
    'google_storage_bucket_iam_member.build_cloudbuild_source_reader',
    'google_secret_manager_secret_iam_member.database_migration_accessor',
  ]) {
    assert.ok(script.includes(address), `missing scratch import candidate ${address}`);
  }
  assert.match(script, /google_project_service\.bootstrap\[/);
  assert.match(script, /google_secret_manager_secret\.runtime\[/);
  assert.match(script, /google_secret_manager_secret_iam_member\.build\[/);
  assert.match(script, /google_project_iam_member\.build\[/);
});

test('scratch plan fails closed on any delete or replacement action', () => {
  assert.match(script, /index\("delete"\)/);
  assert.match(script, /scratch adoption plan contains delete\/replacement actions/);
  assert.match(script, /resource_changes/);
});

test('scratch planner reports only metadata/action summaries, not secret payloads', () => {
  assert.match(script, /SCRATCH_ADOPTION_SUMMARY/);
  assert.match(script, /SCRATCH STATE ADDRESSES/);
  assert.match(script, /REMAINING PLAN ACTIONS/);
  assert.doesNotMatch(script, /secret_data|secretData|versions access/);
});
