import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = await readFile(new URL('../scripts/bootstrap-new-production-project.sh', import.meta.url), 'utf8');

test('bootstrap protects local plan and evidence files by default', () => {
  assert.match(script, /umask 077/);
});

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

test('state bucket IAM must remain private and gains only the scoped deployer object binding', () => {
  assert.match(script, /verify_state_bucket_policy\(\)/);
  assert.match(script, /allUsers/);
  assert.match(script, /allAuthenticatedUsers/);
  assert.match(script, /Terraform state bucket must not grant public IAM principals/);
  assert.match(script, /roles\/storage\.objectAdmin/);
  assert.match(script, /Terraform state bucket is missing the deployer objectAdmin binding/);
  assert.match(script, /terraform -chdir=infra\/iac\/bootstrap output -raw deployer_service_account_email/);
  assert.match(script, /verify_state_bucket_policy "\$deployer_email"/);
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
    'source_commit_sha=$CURRENT_SHA',
    'configuration_sha256=$CONFIGURATION_SHA256',
    'terraform_state_bucket_name=$TF_STATE_BUCKET',
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

test('bootstrap grants WIF deployer object access only on the protected Terraform state bucket', async () => {
  const bootstrap = await readFile(new URL('../infra/iac/bootstrap/main.tf', import.meta.url), 'utf8');
  const variables = await readFile(new URL('../infra/iac/bootstrap/variables.tf', import.meta.url), 'utf8');
  assert.match(variables, /terraform_state_bucket_name/);
  assert.match(bootstrap, /deployer_terraform_state_objects/);
  assert.match(bootstrap, /bucket = var\.terraform_state_bucket_name/);
  assert.match(bootstrap, /role   = "roles\/storage\.objectAdmin"/);
  assert.match(bootstrap, /serviceAccount:\$\{google_service_account\.deployer\.email\}/);
  assert.match(bootstrap, /Khedmah production Terraform state only/);
  assert.match(bootstrap, /resource\.name\.startsWith/);
  assert.match(bootstrap, /objects\/khedmah\/production\//);
  assert.match(script, /expected_prefix="projects\/_\/buckets\/\$TF_STATE_BUCKET\/objects\/khedmah\/production\/"/);
  assert.match(script, /prefix-scoped deployer objectAdmin binding/);
  const projectRoles = bootstrap.split('deployer_roles = toset([')[1]?.split('])')[0] ?? '';
  assert.doesNotMatch(projectRoles, /roles\/storage\.objectAdmin/);
});

test('saved bootstrap plan is bound to the active project region repository and main ref', () => {
  assert.match(script, /verify_plan_target\(\)/);
  for (const field of [
    'project_id',
    'region',
    'source_commit_sha',
    'configuration_sha256',
    'terraform_state_bucket_name',
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

test('bootstrap requires origin itself to be the canonical GitHub repository', () => {
  assert.match(script, /git remote get-url origin/);
  assert.match(script, /origin must point to the canonical GitHub repository/);
  assert.match(script, /git@github\.com:\$CANONICAL_GITHUB_REPOSITORY\.git/);
  assert.match(script, /https:\/\/github\.com\/\$CANONICAL_GITHUB_REPOSITORY\.git/);
});

test('bootstrap rejects any non-canonical GitHub repository before planning WIF trust', () => {
  assert.match(script, /CANONICAL_GITHUB_REPOSITORY="khedma-sy\/khedmah-digital-v1"/);
  assert.match(script, /test "\$GITHUB_REPOSITORY" = "\$CANONICAL_GITHUB_REPOSITORY"/);
  assert.match(script, /bootstrap repository must be \$CANONICAL_GITHUB_REPOSITORY/);
  assert.match(script, /--arg repository "\$CANONICAL_GITHUB_REPOSITORY"/);
});

test('saved bootstrap plan must be complete and non-errored', () => {
  assert.match(script, /\.complete == true/);
  assert.match(script, /\.errored == false/);
});

test('bootstrap computes a fingerprint from the canonical Terraform configuration files', () => {
  assert.match(script, /bootstrap_configuration_sha256\(\)/);
  for (const file of ['main.tf', 'variables.tf', 'outputs.tf', 'versions.tf']) {
    assert.ok(script.includes(`infra/iac/bootstrap/${file}`), `missing fingerprint input ${file}`);
  }
  assert.match(script, /CONFIGURATION_SHA256="\$\(bootstrap_configuration_sha256\)"/);
  assert.match(script, /-var=configuration_sha256=\$CONFIGURATION_SHA256/);
});

test('saved bootstrap plan must contain the exact canonical Terraform resource inventory', () => {
  assert.match(script, /\.configuration\.root_module\.resources\[\]\?\.address/);
  assert.match(script, /\.configuration\.root_module\.module_calls/);
  for (const address of ["google_project_service.bootstrap","terraform_data.bootstrap_provenance","google_storage_bucket.cloudbuild_source","google_storage_bucket_iam_member.deployer_cloudbuild_source_objects","google_sql_database_instance.postgres","google_sql_database.application","google_artifact_registry_repository.docker","google_service_account.runtime","google_service_account.deployer","google_storage_bucket_iam_member.deployer_terraform_state_objects","google_service_account.build","google_service_account.migration","google_project_iam_member.runtime_cloud_sql_client","google_project_iam_member.migration_cloud_sql_client","google_service_account_iam_member.deployer_migration_user","google_project_iam_custom_role.database_user_role_manager","google_project_iam_member.deployer_database_user_role_manager","google_project_iam_custom_role.storage_bucket_policy_viewer","google_project_iam_member.deployer_storage_bucket_policy_viewer","google_project_iam_member.deployer","google_project_iam_member.build","google_service_account_iam_member.build_runtime_user","google_storage_bucket_iam_member.build_cloudbuild_source_reader","google_secret_manager_secret.runtime","google_secret_manager_secret_iam_member.runtime","google_secret_manager_secret_iam_member.build","google_secret_manager_secret.database_migration","google_secret_manager_secret_iam_member.database_migration_accessor","google_secret_manager_secret_iam_member.database_migration_deployer_version_manager","google_secret_manager_secret_iam_member.maps_browser_deployer_version_manager","google_secret_manager_secret.maps_android","google_secret_manager_secret_iam_member.maps_android_deployer_version_manager","google_secret_manager_secret_iam_member.maps_android_deployer_accessor","google_secret_manager_secret_iam_member.oauth_server_deployer_accessor","google_secret_manager_secret.bootstrap_admin","google_secret_manager_secret_iam_member.bootstrap_admin_runtime","google_secret_manager_secret_iam_member.bootstrap_admin_deployer","google_secret_manager_secret_iam_member.bootstrap_admin_version_manager","google_iam_workload_identity_pool.github","google_iam_workload_identity_pool_provider.github","google_service_account_iam_member.github_deployer"]) {
    assert.ok(script.includes(`"${address}"`), `missing canonical plan resource ${address}`);
  }
});

test('saved plan must contain matching provenance resource and configuration fingerprint', async () => {
  const bootstrap = await readFile(new URL('../infra/iac/bootstrap/main.tf', import.meta.url), 'utf8');
  assert.match(bootstrap, /terraform_data" "bootstrap_provenance/);
  assert.match(bootstrap, /configuration_sha256\s+= var\.configuration_sha256/);
  assert.match(script, /\.variables\.configuration_sha256\.value == \$configuration_sha256/);
  assert.match(script, /terraform_data\.bootstrap_provenance/);
  assert.match(script, /\.values\.input\.configuration_sha256 == \$configuration_sha256/);
  assert.match(script, /\.values\.input\.source_commit_sha == \$source_commit/);
});

test('saved bootstrap plan is cryptographically bound to the current main commit through Terraform input', () => {
  assert.match(script, /-var=source_commit_sha=\$CURRENT_SHA/);
  assert.match(script, /--arg source_commit "\$CURRENT_SHA"/);
  assert.match(script, /\.variables\.source_commit_sha\.value == \$source_commit/);
});

test('PLAN is non-mutating and persists a checksum-addressable reviewed plan', () => {
  const plan = section('  PLAN)', '\n  APPLY)');
  assert.match(plan, /terraform -chdir=infra\/iac\/bootstrap plan/);
  assert.match(plan, /-lock=false/);
  assert.doesNotMatch(plan, /-lock-timeout=/);
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
  assert.match(verify, /VERIFIED: bootstrap state, IAM and sanitized outputs/);
  assert.doesNotMatch(verify, /terraform .* apply|gcloud services enable|buckets create|buckets update/);
  assert.match(script, /secret_ids: \.secret_ids\.value/);
});
