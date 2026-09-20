import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(new URL('..', import.meta.url).pathname);
const validator = resolve(root, 'scripts/deployment/validate-staging-deployment-config.sh');

const valid = {
  GCP_WORKLOAD_IDENTITY_PROVIDER: 'projects/123456789/locations/global/workloadIdentityPools/khedmah-staging/providers/github',
  GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT: 'github-staging@khedmah-staging.iam.gserviceaccount.com',
  GCP_STAGING_RUNTIME_SERVICE_ACCOUNT: 'runtime-staging@khedmah-staging.iam.gserviceaccount.com',
  DEVELOPMENT_GOOGLE_CLOUD_PROJECT: 'khedmah-development',
  PREVIEW_GOOGLE_CLOUD_PROJECT: 'khedmah-preview',
  STAGING_GOOGLE_CLOUD_PROJECT: 'khedmah-staging',
  STAGING_GOOGLE_CLOUD_PROJECT_NUMBER: '123456789',
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedmah-production',
  DEVELOPMENT_FIREBASE_PROJECT_ID: 'khedmah-development-firebase',
  PREVIEW_FIREBASE_PROJECT_ID: 'khedmah-preview-firebase',
  STAGING_FIREBASE_PROJECT_ID: 'khedmah-staging-firebase',
  PRODUCTION_FIREBASE_PROJECT_ID: 'khedmah-production-firebase',
  GOOGLE_CLOUD_REGION: 'me-central1',
  STAGING_ARTIFACT_REPOSITORY: 'khedmah-staging',
  STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'khedmah-staging:me-central1:khedmah-staging-db',
  STAGING_GCS_MEDIA_BUCKET: 'khedmah-staging-media',
  STAGING_EMAIL_FROM: 'noreply@staging.example'
};

function run(overrides = {}, removals = []) {
  const env = { ...process.env, ...valid, ...overrides };
  for (const name of removals) delete env[name];
  return spawnSync(validator, [], { cwd: root, env, encoding: 'utf8' });
}

test('staging deployment configuration preflight accepts a complete isolated contract without echoing protected identity values', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preflight passed/);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(output, /123456789/);
  assert.doesNotMatch(output, /github-staging@/);
  assert.doesNotMatch(output, /runtime-staging@/);
});

test('staging deployment configuration preflight reports every missing protected value before GCP auth', () => {
  const result = run({}, [
    'GCP_WORKLOAD_IDENTITY_PROVIDER',
    'GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT',
    'STAGING_GOOGLE_CLOUD_PROJECT_NUMBER',
    'STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME',
    'STAGING_GCS_MEDIA_BUCKET',
    'STAGING_EMAIL_FROM'
  ]);
  assert.equal(result.status, 2);
  for (const name of [
    'GCP_WORKLOAD_IDENTITY_PROVIDER',
    'GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT',
    'STAGING_GOOGLE_CLOUD_PROJECT_NUMBER',
    'STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME',
    'STAGING_GCS_MEDIA_BUCKET',
    'STAGING_EMAIL_FROM'
  ]) assert.match(result.stderr, new RegExp(name));
});

test('staging deployment configuration preflight rejects duplicate cloud and Firebase identities before authentication', () => {
  const duplicateCloud = run({ STAGING_GOOGLE_CLOUD_PROJECT: valid.PREVIEW_GOOGLE_CLOUD_PROJECT });
  assert.equal(duplicateCloud.status, 2);
  assert.match(duplicateCloud.stderr, /GOOGLE_CLOUD_PROJECT identities must be unique/);

  const duplicateFirebase = run({ STAGING_FIREBASE_PROJECT_ID: valid.PRODUCTION_FIREBASE_PROJECT_ID });
  assert.equal(duplicateFirebase.status, 2);
  assert.match(duplicateFirebase.stderr, /FIREBASE_PROJECT_ID identities must be unique/);
});

test('staging deployment configuration preflight rejects malformed WIF and project-number values', () => {
  const malformedProvider = run({ GCP_WORKLOAD_IDENTITY_PROVIDER: 'preview-provider' });
  assert.equal(malformedProvider.status, 2);
  assert.match(malformedProvider.stderr, /canonical Workload Identity Provider/);

  const malformedProjectNumber = run({ STAGING_GOOGLE_CLOUD_PROJECT_NUMBER: 'khedmah-staging' });
  assert.equal(malformedProjectNumber.status, 2);
  assert.match(malformedProjectNumber.stderr, /must be a numeric Google Cloud project number/);
});

test('staging deployment configuration preflight rejects a WIF provider from a different project number', () => {
  const result = run({ GCP_WORKLOAD_IDENTITY_PROVIDER: 'projects/987654321/locations/global/workloadIdentityPools/khedmah-preview/providers/github' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /must belong to STAGING_GOOGLE_CLOUD_PROJECT_NUMBER/);
  assert.doesNotMatch(result.stderr, /987654321/);
  assert.doesNotMatch(result.stderr, /123456789/);
});

test('staging deployment configuration preflight rejects service-account identities that are malformed or outside Staging', () => {
  const malformedDeployer = run({ GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT: 'preview@example.com' });
  assert.equal(malformedDeployer.status, 2);
  assert.match(malformedDeployer.stderr, /GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT/);

  const previewDeployer = run({ GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT: 'github-preview@khedmah-preview.iam.gserviceaccount.com' });
  assert.equal(previewDeployer.status, 2);
  assert.match(previewDeployer.stderr, /must belong to STAGING_GOOGLE_CLOUD_PROJECT/);

  const productionRuntime = run({ GCP_STAGING_RUNTIME_SERVICE_ACCOUNT: 'runtime-production@khedmah-production.iam.gserviceaccount.com' });
  assert.equal(productionRuntime.status, 2);
  assert.match(productionRuntime.stderr, /must belong to STAGING_GOOGLE_CLOUD_PROJECT/);
});

test('staging deployment configuration preflight requires distinct deployer and runtime identities', () => {
  const result = run({ GCP_STAGING_RUNTIME_SERVICE_ACCOUNT: valid.GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /deployer and runtime service accounts must be distinct/);
});

test('staging deployment configuration preflight rejects cross-project SQL, invalid bucket and invalid sender', () => {
  const sql = run({ STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'other-project:me-central1:db' });
  assert.equal(sql.status, 2);
  assert.match(sql.stderr, /Cloud SQL/);

  const bucket = run({ STAGING_GCS_MEDIA_BUCKET: 'INVALID BUCKET' });
  assert.equal(bucket.status, 2);
  assert.match(bucket.stderr, /bucket name/);

  const sender = run({ STAGING_EMAIL_FROM: 'not-an-email' });
  assert.equal(sender.status, 2);
  assert.match(sender.stderr, /sender email/);
});
