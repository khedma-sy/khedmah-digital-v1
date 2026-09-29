import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const scriptPath = new URL('../scripts/adopt-existing-production-bootstrap.sh', import.meta.url);
const script = await readFile(scriptPath, 'utf8');

test('adoption script is syntactically valid bash and fail-closed', () => {
  const check = spawnSync('bash', ['-n', new URL(scriptPath).pathname], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.match(script, /^set -euo pipefail/m);
  assert.match(script, /^set \+x$/m);
  assert.match(script, /umask 077/);
});

test('adoption is locked to the reviewed production authority', () => {
  for (const expected of [
    'CANONICAL_PROJECT="khedma-dl"',
    'CANONICAL_PROJECT_NUMBER="311026134906"',
    'CANONICAL_REGION="europe-west1"',
    'CANONICAL_REPOSITORY="khedma-sy/khedmah-digital-v1"',
    'CANONICAL_REPOSITORY_ID="1307435925"',
    'CANONICAL_OWNER_ID="307214577"',
    'CANONICAL_ENVIRONMENT="production"',
    'CANONICAL_STATE_BUCKET="khedma-dl-khedmah-tfstate"',
    'CANONICAL_STATE_PREFIX="khedmah/production/bootstrap"',
  ]) assert.ok(script.includes(expected), `missing authority lock: ${expected}`);
  assert.match(script, /git fetch origin main --quiet/);
  assert.match(script, /test "\$CURRENT_SHA" = "\$MAIN_SHA"/);
  assert.match(script, /git archive --format=tar "\$CURRENT_SHA" infra\/iac\/bootstrap/);
});

test('reviewed state identity must match generation lineage and serial before mutation', () => {
  assert.match(script, /EXPECTED_STATE_GENERATION is required/);
  assert.match(script, /EXPECTED_STATE_LINEAGE is required/);
  assert.match(script, /EXPECTED_STATE_SERIAL is required/);
  assert.match(script, /gcloud storage objects describe "\$state_uri"/);
  assert.match(script, /test "\$actual_generation" = "\$EXPECTED_STATE_GENERATION"/);
  assert.match(script, /test "\$actual_lineage" = "\$EXPECTED_STATE_LINEAGE"/);
  assert.match(script, /test "\$actual_serial" = "\$EXPECTED_STATE_SERIAL"/);
  assert.match(script, /Terraform state generation changed since review/);
});

test('VERIFY is the default and state mutation requires exact confirmation', () => {
  assert.match(script, /ADOPTION_MODE="\$\{ADOPTION_MODE:-VERIFY\}"/);
  assert.match(script, /NO_MUTATION: adoption verification complete/);
  assert.match(script, /IMPORT_KHEDMAH_BOOTSTRAP_FOUNDATION_A_\$\{SHA7\^\^\}/);
  assert.match(script, /test "\$ADOPTION_CONFIRMATION" = "\$expected_confirmation"/);
});

test('Foundation A contains only the eight reviewed existing resource identities', () => {
  const expected = [
    'google_service_account.build',
    'google_service_account.migration',
    'google_storage_bucket.cloudbuild_source',
    'google_artifact_registry_repository.docker',
    'google_sql_database_instance.postgres',
    'google_sql_database.application',
    'google_project_iam_custom_role.storage_bucket_policy_viewer',
    'google_iam_workload_identity_pool.github',
  ];
  for (const address of expected) {
    assert.ok(script.includes(`"${address}"`), `missing Foundation A address: ${address}`);
  }

  const imports = [...script.matchAll(/import_if_missing "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports, expected);
  assert.equal(imports.length, 8);

  for (const forbidden of [
    'import_if_missing "google_service_account.runtime"',
    'import_if_missing "google_service_account.deployer"',
    'import_if_missing "google_iam_workload_identity_pool_provider.github"',
    'import_if_missing "google_secret_manager_secret',
  ]) assert.doesNotMatch(script, new RegExp(forbidden.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')));
});

test('Foundation A uses provider-supported fully scoped import identities', () => {
  for (const id of [
    'projects/$CANONICAL_PROJECT/serviceAccounts/khedmah-v1-build@$CANONICAL_PROJECT.iam.gserviceaccount.com',
    'projects/$CANONICAL_PROJECT/serviceAccounts/khedmah-v1-migrator@$CANONICAL_PROJECT.iam.gserviceaccount.com',
    '$CANONICAL_PROJECT/$CANONICAL_PROJECT-cloudbuild-source',
    'projects/$CANONICAL_PROJECT/locations/$CANONICAL_REGION/repositories/khedmah-digital',
    'projects/$CANONICAL_PROJECT/instances/khedmah-v1-db',
    'projects/$CANONICAL_PROJECT/instances/khedmah-v1-db/databases/khedmah',
    'projects/$CANONICAL_PROJECT/roles/khedmahStorageBucketPolicyViewer',
    'projects/$CANONICAL_PROJECT/locations/global/workloadIdentityPools/khedmah-github',
  ]) assert.ok(script.includes(`"${id}"`), `missing import identity: ${id}`);
});

test('adoption preserves reviewed legacy/canonical identity split and operational assumptions', () => {
  assert.match(script, /verify_present_service_account "khedma-v1-runtime@/);
  assert.match(script, /verify_present_service_account "khedma-v1-deployer@/);
  assert.match(script, /verify_absent_service_account "khedmah-v1-runtime@/);
  assert.match(script, /verify_absent_service_account "khedmah-v1-deployer@/);
  assert.match(script, /--managed-by=user/);
  assert.match(script, /Cloud Run services now exist/);
  assert.match(script, /khedmah-database-role-inventory khedmah-database-role-prepare khedmah-database-role-verify/);
  assert.match(script, /khedmah-v1-migrator@\$CANONICAL_PROJECT\.iam\.gserviceaccount\.com/);
  assert.match(script, /khedmah-production-trigger/);
  assert.match(script, /\.disabled == true/);
});

test('Cloud SQL import is guarded by live safety baseline and known drift is not applied', () => {
  for (const token of [
    '.databaseVersion == "POSTGRES_16"',
    '.settings.tier == "db-f1-micro"',
    '.settings.availabilityType == "ZONAL"',
    '.settings.dataDiskType == "PD_SSD"',
    '.settings.storageAutoResize == true',
    '.settings.deletionProtectionEnabled == true',
  ]) assert.ok(script.includes(token), `missing SQL guard: ${token}`);
  assert.match(script, /KNOWN_DRIFT: CLOUD_SQL_BACKUP_START=/);
  assert.match(script, /KNOWN_DRIFT: CLOUD_SQL_PITR_FIELD_PRESENT=/);
  assert.match(script, /NO_APPLY: do not apply infrastructure changes/);
});

test('WIF provider is verified but deliberately excluded from Foundation A import', () => {
  assert.match(script, /workload-identity-pools providers describe github-actions/);
  assert.match(script, /attributeMapping\["google.subject"\] == "assertion.sub"/);
  assert.match(script, /contains\("1307435925"\)/);
  assert.match(script, /contains\("307214577"\)/);
  assert.match(script, /contains\("environment:production"\)/);
  assert.match(script, /WIF provider exists but is excluded from Foundation A/);
  assert.doesNotMatch(script, /import_if_missing "google_iam_workload_identity_pool_provider.github"/);
});

test('state mutation is resumable, backed up locally, and constrained to the exact address set', () => {
  assert.match(script, /terraform -chdir="\$BOOTSTRAP_TF_DIR" state pull >"\$backup_file"/);
  assert.match(script, /STATE_BACKUP_SHA256=/);
  assert.match(script, /comm -23 "\$state_addresses_file" "\$allowed_addresses_file"/);
  assert.match(script, /comm -3 "\$post_state" "\$allowed_addresses_file"/);
  assert.match(script, /SKIP_ALREADY_IMPORTED/);
  assert.match(script, /-lock-timeout=60s/);
  assert.match(script, /POST_IMPORT_STATE_GENERATION=/);
});

test('adoption script never applies cloud changes or reads secret payloads', () => {
  assert.doesNotMatch(script, /^\s*terraform(?:\s+-chdir="[^"]+")?\s+apply\b/m);
  assert.doesNotMatch(script, /^\s*terraform(?:\s+-chdir="[^"]+")?\s+state\s+(?:rm|mv|push)\b/m);
  assert.doesNotMatch(script, /add-iam-policy-binding|set-iam-policy/);
  assert.doesNotMatch(script, /secrets\s+versions\s+access/);
  assert.doesNotMatch(script, /gcloud\s+run\s+(?:deploy|services\s+update)/);
  assert.doesNotMatch(script, /gcloud\s+sql\s+instances\s+patch/);
});
