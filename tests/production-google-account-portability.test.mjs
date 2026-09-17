import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const legacyIdentifiers = [
  'project-94512a0e-1a5e-4bdb-87f',
  '774201339973'
];

const productionFiles = [
  'cloudbuild.production.yaml',
  '.github/workflows/production-operator.yml',
  '.github/workflows/terraform-media-apply.yml',
  'scripts/google-production-deploy.sh',
  'scripts/validate-production-deployment-readiness.sh',
  'apps/backend/src/middleware/csrf-origin.middleware.ts',
  'docs/google/firebase-sdk-integration.md'
];

test('production implementation is portable to a new Google account', async () => {
  for (const file of productionFiles) {
    const content = await read(file);
    for (const identifier of legacyIdentifiers) {
      assert.doesNotMatch(content, new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${file} still binds production to legacy Google identity ${identifier}`);
    }
  }
});

test('production Cloud Build refuses account-specific placeholders and discovers runtime URLs', async () => {
  const build = await read('cloudbuild.production.yaml');
  assert.match(build, /REQUIRED_FROM_OPERATOR/);
  assert.match(build, /validate-production-substitutions/);
  assert.match(build, /gcloud run services describe '\$\{_BACKEND_SERVICE\}'/);
  assert.match(build, /gcloud run services describe '\$\{_FRONTEND_SERVICE\}'/);
  assert.match(build, /NEXT_PUBLIC_API_URL="\$\$BACKEND_URL"/);
  assert.doesNotMatch(build, /_NEXT_PUBLIC_API_URL:/);
  assert.doesNotMatch(build, /_CORS_ORIGIN:/);
});

test('production operator sources deployment identity from protected environment values', async () => {
  const operator = await read('.github/workflows/production-operator.yml');
  for (const variable of [
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_REGION',
    'OPERATIONS_RUNTIME_SERVICE_ACCOUNT',
    'CLOUD_SQL_INSTANCE_CONNECTION_NAME',
    'GCS_MEDIA_BUCKET',
    'GOOGLE_MAPS_ALLOWED_WEB_ORIGINS',
    'PUBLIC_SITE_URL',
    'EMAIL_FROM'
  ]) {
    assert.match(operator, new RegExp(`${variable}: \\$\\{\\{ vars\\.${variable} \\}\\}`));
  }
  assert.match(operator, /GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(operator, /OPERATIONS_DEPLOYER_SERVICE_ACCOUNT/);
});
