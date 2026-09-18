import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const bootstrap = await readFile(new URL('../infra/iac/bootstrap/main.tf', import.meta.url), 'utf8');
const variables = await readFile(new URL('../infra/iac/bootstrap/variables.tf', import.meta.url), 'utf8');
const outputs = await readFile(new URL('../infra/iac/bootstrap/outputs.tf', import.meta.url), 'utf8');
const cloudBuild = await readFile(new URL('../cloudbuild.production-new-account.yaml', import.meta.url), 'utf8');

const buildWorkflows = [
  '.github/workflows/production-operator-new-account.yml',
  '.github/workflows/production-baseline-001-020.yml',
  '.github/workflows/production-operator.yml',
  '.github/workflows/production-migrations-025-034.yml'
];

test('bootstrap provisions a dedicated least-privilege production build identity', () => {
  assert.match(variables, /build_service_account_id/);
  assert.match(bootstrap, /google_service_account" "build"/);
  assert.match(bootstrap, /roles\/artifactregistry\.writer/);
  assert.match(bootstrap, /roles\/logging\.logWriter/);
  assert.match(bootstrap, /roles\/run\.admin/);
  assert.match(bootstrap, /build_runtime_user/);
  assert.match(bootstrap, /roles\/iam\.serviceAccountUser/);
  assert.match(bootstrap, /build_cloudbuild_source_reader/);
  assert.match(bootstrap, /roles\/storage\.objectViewer/);
  assert.match(outputs, /build_service_account_email/);
  assert.doesNotMatch(bootstrap, /resource "google_project_iam_member" "build"[\s\S]*?roles\/owner/);
});

test('every frontend build-time Secret Manager binding is granted to the dedicated build identity', () => {
  const secretIds = [...cloudBuild.matchAll(/secrets\/([A-Z0-9_]+)\/versions\/latest/g)].map(m => m[1]);
  assert.ok(secretIds.length >= 8);
  for (const secret of secretIds) {
    assert.ok(bootstrap.includes(`"${secret}"`), `bootstrap does not create/grant build secret ${secret}`);
  }
  assert.match(bootstrap, /google_secret_manager_secret_iam_member" "build"/);
  assert.match(bootstrap, /roles\/secretmanager\.secretAccessor/);
});

for (const path of buildWorkflows) test(`${path}: uses dedicated build identity and never the project default`, async () => {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(source, /OPERATIONS_BUILD_SERVICE_ACCOUNT/);
  assert.match(source, /projects\/\$\{GOOGLE_CLOUD_PROJECT\}\/serviceAccounts\/\$\{OPERATIONS_BUILD_SERVICE_ACCOUNT\}/);
  assert.doesNotMatch(source, /gcloud builds get-default-service-account/);
});


test('Cloud Build can inspect the approved Cloud SQL attachment without database access', async () => {
  const bootstrap = await read('../infra/iac/bootstrap/main.tf');
  const buildRoles = bootstrap.split('build_roles = toset([')[1]?.split('])')[0] ?? '';
  assert.match(buildRoles, /roles\/cloudsql\.viewer/);
  assert.doesNotMatch(buildRoles, /roles\/cloudsql\.(admin|editor)/);
});
