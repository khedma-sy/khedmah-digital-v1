import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bootstrap = readFileSync('infra/iac/bootstrap/main.tf', 'utf8');
const bootstrapVariables = readFileSync('infra/iac/bootstrap/variables.tf', 'utf8');
const productionWif = readFileSync('infra/iac/production_operator.tf', 'utf8');
const vars = readFileSync('infra/iac/bootstrap/staging.tfvars.example', 'utf8');
const ci = readFileSync('.github/workflows/node.js.yml', 'utf8');

function expectValue(name, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(vars, new RegExp(`${name}\\s*=\\s*"${escaped}"`));
}

test('staging bootstrap example is locked to the isolated staging workflow trust boundary', () => {
  expectValue('github_repository', 'khedma-sy/khedmah-digital-v1');
  expectValue('github_workflow_path', '.github/workflows/staging-deployment.yml');
  expectValue('github_ref', 'refs/heads/develop');
  expectValue('artifact_registry_repository_id', 'khedmah-staging');
  expectValue('runtime_service_account_id', 'khedmah-v1-staging-runtime');
  expectValue('deployer_service_account_id', 'khedmah-v1-staging-deployer');
  assert.match(vars, /REPLACE_WITH_ISOLATED_STAGING_PROJECT_ID/);
  assert.doesNotMatch(vars, /khedmah-preview-[0-9]{6,}/);
  assert.doesNotMatch(vars, /production-operator\.yml/);
  assert.doesNotMatch(vars, /refs\/heads\/main/);
});


test('staging retains its shared Cloud SQL tier default while Production sets its tier explicitly', () => {
  const tier = bootstrapVariables.match(/variable "cloud_sql_tier" \{[\s\S]*?\n\}/)?.[0];
  assert.ok(tier, 'missing shared Cloud SQL tier variable');
  assert.match(tier, /default\s*=\s*"db-custom-1-3840"/);
  assert.doesNotMatch(vars, /^\s*cloud_sql_tier\s*=/m);
});

test('bootstrap provider uses a bounded workflow_ref allowlist on the configured ref', () => {
  for (const claim of [
    'assertion.repository == "${var.github_repository}"',
    'assertion.ref == "${var.github_ref}"',
    'assertion.workflow_ref in ${jsonencode(local.github_workflow_refs)}'
  ]) assert.ok(bootstrap.includes(claim), `missing WIF claim boundary: ${claim}`);
  assert.match(bootstrap, /"attribute\.workflow_ref"\s*=\s*"assertion\.workflow_ref"/);
  assert.match(bootstrap, /"attribute\.repository_id"\s*=\s*"assertion\.repository_id"/);
  assert.match(bootstrap, /"attribute\.repository_owner_id"\s*=\s*"assertion\.repository_owner_id"/);
  assert.match(bootstrap, /github_repository_id_condition/);
  assert.match(bootstrap, /github_repository_owner_id_condition/);
  assert.match(bootstrap, /github_subject_condition/);
  assert.match(bootstrap, /github_additional_workflow_paths/);
  assert.doesNotMatch(bootstrap, /job_workflow_ref/);
  assert.match(productionWif, /production-operator-new-account\.yml@refs\/heads\/main/);
  assert.match(productionWif, /production-baseline-001-020\.yml@refs\/heads\/main/);
  assert.match(productionWif, /production-bootstrap-admin\.yml@refs\/heads\/main/);
  assert.match(productionWif, /production-migrations-025-034\.yml@refs\/heads\/main/);
  assert.match(productionWif, /production-operator\.yml@refs\/heads\/main/);
  const legacySchemaOperator = readFileSync('.github/workflows/production-operator.yml', 'utf8');
  assert.match(legacySchemaOperator, /APPLY_MIGRATION_021/);
  assert.match(legacySchemaOperator, /APPLY_MIGRATION_022/);
  assert.match(legacySchemaOperator, /APPLY_MIGRATION_024/);
  assert.doesNotMatch(legacySchemaOperator, /DEPLOY_PRODUCTION|gcloud builds submit.*cloudbuild\.production-new-account\.yaml/);
  assert.match(bootstrap, /roles\/iam\.workloadIdentityUser/);
  assert.match(bootstrap, /google_service_account\.deployer\.name/);
});

test('bootstrap provisions protected Cloud SQL, Cloud Build source storage and runtime secret containers without secret values', () => {
  assert.match(bootstrap, /sqladmin\.googleapis\.com/);
  assert.match(bootstrap, /storage\.googleapis\.com/);
  assert.match(bootstrap, /google_storage_bucket" "cloudbuild_source"/);
  assert.match(bootstrap, /google_sql_database_instance" "postgres"/);
  assert.match(bootstrap, /database_version\s*=\s*"POSTGRES_16"/);
  assert.match(bootstrap, /deletion_protection\s*=\s*true/);
  assert.match(bootstrap, /point_in_time_recovery_enabled\s*=\s*true/);
  assert.match(bootstrap, /roles\/cloudsql\.client/);
  assert.match(bootstrap, /roles\/cloudsql\.viewer/);
  assert.match(bootstrap, /roles\/storage\.objectAdmin/);
  assert.doesNotMatch(bootstrap, /roles\/storage\.admin/);
  assert.doesNotMatch(bootstrap, /secret_data\s*=/);
  for (const secret of ['DATABASE_URL', 'FIREBASE_API_KEY', 'GOOGLE_MAPS_BROWSER_API_KEY', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'OPERATIONS_PRODUCT_ROLE_BINDINGS', 'RESEND_API_KEY']) {
    assert.match(bootstrapVariables, new RegExp(`"${secret}"`));
  }
});

test('CI validates the bootstrap Terraform stack without applying it', () => {
  assert.match(ci, /terraform -chdir=infra\/iac\/bootstrap init -backend=false -input=false/);
  assert.match(ci, /terraform -chdir=infra\/iac\/bootstrap validate/);
  assert.doesNotMatch(ci, /terraform -chdir=infra\/iac\/bootstrap apply/);
});
