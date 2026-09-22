import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('manual Google Production readiness locks exact main before WIF authentication', async () => {
  const workflow = await read('.github/workflows/google-production-readiness.yml');
  const lock = workflow.indexOf('Lock manual readiness to exact latest main');
  const auth = workflow.indexOf('Authenticate to Production Google Cloud for read-only certification');
  const live = workflow.indexOf('Certify live new-account Secret Manager metadata and IAM');
  assert.ok(lock >= 0 && auth > lock && live > auth);
  assert.ok(workflow.includes('test "$GITHUB_REPOSITORY" = "khedma-sy/khedmah-digital-v1"'));
  assert.ok(workflow.includes('test "$GITHUB_REF" = "refs/heads/main"'));
  assert.ok(workflow.includes('test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"'));
  assert.ok(workflow.includes('id-token: write'));
  assert.ok(workflow.includes('workload_identity_provider: ${{ secrets.GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER }}'));
  assert.ok(workflow.includes('service_account: ${{ secrets.OPERATIONS_DEPLOYER_SERVICE_ACCOUNT }}'));
});

test('live secret certification is metadata-only and covers the 17 permanent GCP secrets', async () => {
  const certification = await read('scripts/validate-production-live-secret-certification.sh');
  const permanent = [
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
  ];
  assert.equal(permanent.length, 17);
  for (const name of permanent) assert.ok(certification.includes(name), `missing permanent secret ${name}`);
  assert.ok(certification.includes('gcloud secrets describe'));
  assert.ok(certification.includes('gcloud secrets versions describe latest'));
  assert.ok(certification.includes('gcloud secrets get-iam-policy'));
  assert.ok(certification.includes('SECRET_PAYLOADS_READ=0'));
  assert.ok(!certification.includes('secrets versions access'));
  const permanentBlock = certification.split('permanent_secret_names=(')[1]?.split(')')[0] ?? '';
  assert.ok(!permanentBlock.includes('BOOTSTRAP_ADMIN_SECRET'));
});

test('live secret certification binds project and active deployer before inspecting IAM', async () => {
  const certification = await read('scripts/validate-production-live-secret-certification.sh');
  assert.ok(certification.includes('test "$GOOGLE_CLOUD_PROJECT" = "$PRODUCTION_GOOGLE_CLOUD_PROJECT"'));
  assert.ok(certification.includes('gcloud auth list'));
  assert.ok(certification.includes('test "$active_account" = "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT"'));
  assert.ok(certification.includes('gcloud projects describe "$GOOGLE_CLOUD_PROJECT"'));
  assert.ok(certification.includes('projects/$GOOGLE_CLOUD_PROJECT/secrets/$secret_name'));
  assert.ok(certification.includes('projects/$project_number/secrets/$secret_name'));
});

test('live secret IAM certification enforces the canonical principals and rejects public or unexpected bindings', async () => {
  const certification = await read('scripts/validate-production-live-secret-certification.sh');
  assert.ok(certification.includes('roles/secretmanager.secretAccessor'));
  assert.ok(certification.includes('roles/secretmanager.secretVersionManager'));
  assert.ok(certification.includes('$OPERATIONS_RUNTIME_SERVICE_ACCOUNT'));
  assert.ok(certification.includes('$OPERATIONS_BUILD_SERVICE_ACCOUNT'));
  assert.ok(certification.includes('$OPERATIONS_MIGRATION_SERVICE_ACCOUNT'));
  assert.ok(certification.includes('$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT'));
  assert.ok(certification.includes('allUsers'));
  assert.ok(certification.includes('allAuthenticatedUsers'));
  assert.ok(certification.includes('test "$actual_policy" = "$expected_policy"'));
  assert.ok(certification.includes('Conditional Secret Manager IAM is outside the canonical bootstrap contract.'));
});
