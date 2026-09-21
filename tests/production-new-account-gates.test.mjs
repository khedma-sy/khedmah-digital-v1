import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('new-account bootstrap grants the reader role required to inspect user-managed service-account keys', async () => {
  const bootstrap = await read('infra/iac/bootstrap/main.tf');
  assert.match(bootstrap, /roles\/iam\.serviceAccountViewer/);
  assert.doesNotMatch(bootstrap, /"roles\/(owner|editor)"/);
});

test('bootstrap admin proves live secret IAM before any Cloud Run secret mutation', async () => {
  const workflow = await read('.github/workflows/production-bootstrap-admin.yml');
  const preflight = workflow.indexOf('Verify bootstrap secret IAM before mutation');
  const bind = workflow.indexOf('Bind the one-time bootstrap secret to the active backend revision');
  assert.ok(preflight >= 0 && bind > preflight, 'IAM preflight must run before bootstrap secret binding');
  assert.match(workflow, /gcloud secrets get-iam-policy BOOTSTRAP_ADMIN_SECRET/);
  assert.match(workflow, /roles\/secretmanager\.secretAccessor/);
  assert.match(workflow, /roles\/secretmanager\.secretVersionManager/);
  assert.match(workflow, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT/);
  assert.match(workflow, /gcloud auth list/);
});

test('production deployment readiness verifies migration identity and all permanent new-account Secret Manager inputs', async () => {
  const readiness = await read('scripts/validate-production-deployment-readiness.sh');
  assert.match(readiness, /OPERATIONS_MIGRATION_SERVICE_ACCOUNT/);
  assert.match(readiness, /gcloud iam service-accounts describe "\$OPERATIONS_MIGRATION_SERVICE_ACCOUNT"/);
  for (const secret of [
    'DATABASE_URL',
    'DATABASE_MIGRATION_URL',
    'FIREBASE_API_KEY',
    'FIREBASE_APP_ID',
    'GOOGLE_MAPS_ANDROID_API_KEY',
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
    'RESEND_API_KEY'
  ]) assert.ok(readiness.includes(secret), `missing readiness secret ${secret}`);
  assert.doesNotMatch(readiness, /secrets versions access/);
});

test('human-readable secret inventory includes migration and server Maps secrets', async () => {
  const inventory = await read('infra/secrets/required-secrets.yaml');
  assert.match(inventory, /DATABASE_MIGRATION_URL/);
  assert.match(inventory, /GOOGLE_MAPS_SERVER_API_KEY/);
});
