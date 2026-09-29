import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const script = await readFile(
  new URL('../scripts/adopt-production-bootstrap-state.sh', import.meta.url),
  'utf8',
);

test('production bootstrap adoption is exact-main and exact-project locked', () => {
  assert.match(script, /khedma-sy\/khedmah-digital-v1/);
  assert.match(script, /CANONICAL_PROJECT="khedma-dl"/);
  assert.match(script, /CANONICAL_PROJECT_NUMBER="311026134906"/);
  assert.match(script, /CANONICAL_REGION="europe-west1"/);
  assert.match(script, /git rev-parse origin\/main/);
  assert.match(script, /test "\$CURRENT_SHA" = "\$MAIN_SHA"/);
});

test('adoption is state-authority locked to the reviewed empty bootstrap state', () => {
  assert.match(script, /khedma-dl-khedmah-tfstate/);
  assert.match(script, /khedmah\/production\/bootstrap/);
  assert.match(script, /6025674e-1a29-7134-7794-5f106421f6fd/);
  assert.match(script, /1790067677438796/);
  assert.match(script, /unexpected bootstrap state lineage/);
  assert.match(script, /initial bootstrap state generation changed unexpectedly/);
});

test('VERIFY is read-only and import mode requires a SHA-bound confirmation', () => {
  assert.match(script, /ADOPTION_MODE:-VERIFY/);
  assert.match(script, /VERIFY_OK: guarded Batch A adoption preflight passed; no state mutation performed/);
  assert.match(script, /IMPORT_KHEDMAH_BOOTSTRAP_BATCH_A_\$\{SHA7\^\^\}/);
  assert.match(script, /ADOPTION_CONFIRMATION/);
});

test('Batch A imports only the reviewed eight existing resources', () => {
  const addresses = [
    'google_service_account.build',
    'google_service_account.migration',
    'google_storage_bucket.cloudbuild_source',
    'google_artifact_registry_repository.docker',
    'google_sql_database_instance.postgres',
    'google_sql_database.application',
    'google_project_iam_custom_role.storage_bucket_policy_viewer',
    'google_iam_workload_identity_pool.github',
  ];
  for (const address of addresses) {
    assert.ok(script.includes(`"${address}"`), `missing Batch A address ${address}`);
  }
  for (const forbidden of [
    'google_service_account.runtime',
    'google_service_account.deployer',
    'google_iam_workload_identity_pool_provider.github',
    'google_secret_manager_secret.database_migration',
  ]) {
    assert.doesNotMatch(
      script.split('declare -a addresses=(')[1]?.split(')')[0] ?? '',
      new RegExp(forbidden.replaceAll('.', '\\.')),
      `forbidden Batch A address ${forbidden}`,
    );
  }
});

test('adoption never applies, deletes, or rewrites live cloud resources', () => {
  assert.doesNotMatch(script, /terraform[^\n]*\bapply\b/);
  assert.doesNotMatch(script, /terraform[^\n]*state\s+(rm|mv|push)\b/);
  assert.doesNotMatch(script, /gcloud[^\n]*(delete|remove-iam-policy-binding|add-iam-policy-binding|update|deploy)\b/);
  assert.match(script, /NO_APPLY: do not run terraform apply/);
});

test('adoption snapshots state before import and remains resumable only for exact IDs', () => {
  assert.match(script, /khedmah-bootstrap-state-preimport-/);
  assert.match(script, /SNAPSHOT_SHA256/);
  assert.match(script, /SKIP_ALREADY_IMPORTED/);
  assert.match(script, /exists in state with unexpected id/);
  assert.match(script, /IMPORTED_OK/);
});

test('reviewed import IDs are pinned to the canonical live resources', () => {
  for (const id of [
    'projects/khedma-dl/serviceAccounts/khedmah-v1-build@khedma-dl.iam.gserviceaccount.com',
    'projects/khedma-dl/serviceAccounts/khedmah-v1-migrator@khedma-dl.iam.gserviceaccount.com',
    'khedma-dl/khedma-dl-cloudbuild-source',
    'projects/khedma-dl/locations/europe-west1/repositories/khedmah-digital',
    'projects/khedma-dl/instances/khedmah-v1-db',
    'projects/khedma-dl/instances/khedmah-v1-db/databases/khedmah',
    'projects/khedma-dl/roles/khedmahStorageBucketPolicyViewer',
    'projects/khedma-dl/locations/global/workloadIdentityPools/khedmah-github',
  ]) {
    assert.ok(script.includes(`"${id}"`), `missing import ID ${id}`);
  }
});
