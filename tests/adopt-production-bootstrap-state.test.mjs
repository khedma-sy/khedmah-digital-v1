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

test('adoption is state-authority locked to the reviewed bootstrap state lineage and bucket owner', () => {
  assert.match(script, /khedma-dl-khedmah-tfstate/);
  assert.match(script, /khedmah\/production\/bootstrap/);
  assert.match(script, /6025674e-1a29-7134-7794-5f106421f6fd/);
  assert.match(script, /1790067677438796/);
  assert.match(script, /unexpected bootstrap state lineage/);
  assert.match(script, /initial bootstrap state generation changed unexpectedly/);
  assert.match(script, /gcloud storage buckets describe/);
  assert.match(script, /projectNumber \/\/ \.project_number \/\/ empty/);
  assert.match(script, /Terraform state bucket belongs to an unexpected Google Cloud project/);
  assert.match(script, /STATE_BUCKET_PROJECT_NUMBER/);
});

test('adoption requires a real supported Terraform CLI and a read-only dependency lockfile', () => {
  assert.match(script, /TERRAFORM_BIN="\$\(command -v terraform\)"/);
  assert.match(script, /test "\$TERRAFORM_BIN" != "\/google\/bin\/terraform"/);
  assert.match(script, /terraform version -json/);
  assert.match(script, /Terraform >= 1\.8\.0 is required/);
  assert.match(script, /-lockfile=readonly/);
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

test('WIF pool state ID uses the configured project ID while resource name may use project number', () => {
  assert.match(script, /"google_iam_workload_identity_pool\.github": "projects\/khedma-dl\/locations\/global\/workloadIdentityPools\/khedmah-github"/);
  assert.doesNotMatch(script, /"google_iam_workload_identity_pool\.github": "projects\/311026134906\/locations\/global\/workloadIdentityPools\/khedmah-github"/);
});

test('resume guard requires exact reviewed identities for every pre-adopted Batch A resource', () => {
  const match = script.match(/reviewed_batch_a_ids='(\{[\s\S]*?\})'\n\nreviewed_pre_adopted_secret_ids=/);
  assert.ok(match, 'reviewed_batch_a_ids JSON block is required');
  const ids = JSON.parse(match[1]);

  assert.deepEqual(ids, {
    'google_service_account.build': 'projects/khedma-dl/serviceAccounts/khedmah-v1-build@khedma-dl.iam.gserviceaccount.com',
    'google_service_account.migration': 'projects/khedma-dl/serviceAccounts/khedmah-v1-migrator@khedma-dl.iam.gserviceaccount.com',
    'google_storage_bucket.cloudbuild_source': 'khedma-dl-cloudbuild-source',
    'google_artifact_registry_repository.docker': 'projects/khedma-dl/locations/europe-west1/repositories/khedmah-digital',
    'google_sql_database_instance.postgres': 'khedmah-v1-db',
    'google_sql_database.application': 'projects/khedma-dl/instances/khedmah-v1-db/databases/khedmah',
    'google_project_iam_custom_role.storage_bucket_policy_viewer': 'projects/khedma-dl/roles/khedmahStorageBucketPolicyViewer',
    'google_iam_workload_identity_pool.github': 'projects/khedma-dl/locations/global/workloadIdentityPools/khedmah-github',
  });
  assert.match(script, /--argjson reviewed_batch "\$reviewed_batch_a_ids"/);
  assert.match(script, /\(\$reviewed_batch\[\$x\.address\] \/\/ null\) == \$x\.id/);
  assert.match(script, /\.mode \/\/ "managed"/);
  assert.match(script, /\.module \/\/ ""/);
});

test('resume guard tolerates only exact reviewed pre-adopted secret containers', () => {
  assert.match(script, /reviewed_pre_adopted_secret_ids/);
  for (const secret of [
    'DATABASE_URL',
    'FIREBASE_API_KEY',
    'FIREBASE_APP_ID',
    'GOOGLE_MAPS_BROWSER_API_KEY',
    'GOOGLE_MAPS_SERVER_API_KEY',
    'GOOGLE_OAUTH_SERVER_CLIENT_ID',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'OPERATIONS_PRODUCT_ROLE_BINDINGS',
    'RESEND_API_KEY',
  ]) {
    assert.ok(script.includes(`projects/khedma-dl/secrets/${secret}`), `missing reviewed secret id ${secret}`);
  }
  for (const secret of [
    'DATABASE_MIGRATION_URL',
    'GOOGLE_MAPS_ANDROID_API_KEY',
    'BOOTSTRAP_ADMIN_SECRET',
  ]) {
    assert.ok(script.includes(`projects/khedma-dl/secrets/${secret}`), `missing reviewed special secret id ${secret}`);
  }
  assert.match(script, /state contains an unreviewed address, non-root resource, or unexpected resource identity/);
  assert.match(script, /startsWith|startswith/);
});

test('Cloud SQL imported instance uses the provider-normalized state id', () => {
  assert.match(script, /google_sql_database_instance normalizes its imported state id/);
  const expectedIds = script.split('declare -a expected_state_ids=(')[1]?.split(')')[0] ?? '';
  assert.match(expectedIds, /"khedmah-v1-db"/);
  assert.doesNotMatch(expectedIds, /"projects\/khedma-dl\/instances\/khedmah-v1-db"\s*$/m);
});

test('adoption never applies, deletes, or rewrites live cloud resources', () => {
  assert.doesNotMatch(script, /^\s*terraform\b[^\n]*\bapply\b/m);
  assert.doesNotMatch(script, /^\s*terraform\b[^\n]*state\s+(rm|mv|push)\b/m);
  assert.doesNotMatch(script, /^\s*gcloud\b[^\n]*(delete|remove-iam-policy-binding|add-iam-policy-binding|update|deploy)\b/m);
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
