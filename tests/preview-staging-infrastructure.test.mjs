import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
test('preview and staging infrastructure contract is complete', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-preview-staging.mjs'], { encoding: 'utf8' });
  assert.match(output, /infrastructure valid/);
});
test('environment identities must be unique and complete', () => {
  const env = {};
  for (const environment of ['DEVELOPMENT', 'PREVIEW', 'STAGING', 'PRODUCTION']) {
    env[`${environment}_GOOGLE_CLOUD_PROJECT`] = `${environment.toLowerCase()}-cloud`;
    env[`${environment}_FIREBASE_PROJECT_ID`] = `${environment.toLowerCase()}-firebase`;
  }
  assert.match(execFileSync(process.execPath, ['scripts/validate-environment-separation.mjs'], { env, encoding: 'utf8' }), /separation valid/);
  env.STAGING_FIREBASE_PROJECT_ID = env.PRODUCTION_FIREBASE_PROJECT_ID;
  assert.throws(() => execFileSync(process.execPath, ['scripts/validate-environment-separation.mjs'], { env, stdio: 'pipe' }));
});
test('preview isolation does not require a cloud-hosted development project', () => {
  const env = { DEPLOYMENT_ENVIRONMENT: 'preview' };
  for (const environment of ['PREVIEW', 'STAGING', 'PRODUCTION']) {
    env[`${environment}_GOOGLE_CLOUD_PROJECT`] = `${environment.toLowerCase()}-cloud`;
  }
  env.PREVIEW_FIREBASE_PROJECT_ID = 'preview-firebase';
  env.PRODUCTION_FIREBASE_PROJECT_ID = 'production-firebase';
  assert.match(execFileSync(process.execPath, ['scripts/validate-environment-separation.mjs'], { env, encoding: 'utf8' }), /preview, staging, production/);
  env.STAGING_GOOGLE_CLOUD_PROJECT = env.PRODUCTION_GOOGLE_CLOUD_PROJECT;
  assert.throws(() => execFileSync(process.execPath, ['scripts/validate-environment-separation.mjs'], { env, stdio: 'pipe' }));
});
test('preview cleanup refuses the production project before invoking gcloud', () => {
  const env = {
    ...process.env,
    GOOGLE_CLOUD_PROJECT: 'production-project',
    PRODUCTION_GOOGLE_CLOUD_PROJECT: 'production-project',
    GOOGLE_CLOUD_REGION: 'me-central1'
  };
  assert.throws(
    () => execFileSync('bash', ['scripts/deployment/cleanup-preview.sh', '42'], { env, stdio: 'pipe' }),
    error => error.status === 4 && error.stderr.toString().includes('Refusing cleanup in production')
  );
});

test('preview jobs are time-bounded and cleanup never hides cloud deletion failures', () => {
  const workflow = readFileSync('.github/workflows/preview-deployment.yml', 'utf8');
  const cleanup = readFileSync('scripts/deployment/cleanup-preview.sh', 'utf8');
  assert.equal((workflow.match(/timeout-minutes:/g) ?? []).length, 4);
  assert.doesNotMatch(cleanup, /\|\| true/);
  assert.match(cleanup, /gcloud run services list/);
  assert.match(cleanup, /gcloud run services delete/);
  assert.match(cleanup, /gcloud run jobs delete/);
});

test('preview initializes only its isolated database before backend deployment', () => {
  const deployment = readFileSync('scripts/deployment/deploy-cloud-run-environment.sh', 'utf8');
  const runner = readFileSync('scripts/run-preview-migrations.sh', 'utf8');
  const image = readFileSync('Dockerfile.migrations', 'utf8');
  assert.match(deployment, /run-preview-migrations/);
  assert.match(deployment, /EXPECTED_PREVIEW_DATABASE=khedmah_preview/);
  assert.match(deployment, /CLOUD_SQL_INSTANCE_CONNECTION_NAME=\$\{CLOUD_SQL_INSTANCE_CONNECTION_NAME\}/);
  assert.match(deployment, /gcloud run jobs execute/);
  assert.match(runner, /DEPLOYMENT_ENVIRONMENT.*preview/);
  assert.match(runner, /current_database\(\)/);
  assert.match(runner, /pg_advisory_xact_lock/);
  assert.match(runner, /PREVIEW_SCHEMA_PARTIAL_REQUIRES_MANUAL_REPAIR/);
  assert.match(runner, /024_product_store\.sql/);
  assert.match(runner, /025_mobility_requests\.sql/);
  assert.match(runner, /026_cash_fulfillment_orders\.sql/);
  assert.match(runner, /027_professional_service_marketplace\.sql/);
  assert.match(runner, /PREVIEW_SOCKET_URI="%2Fcloudsql%2F\$\{CLOUD_SQL_INSTANCE_CONNECTION_NAME\}"/);
  assert.match(runner, /PREVIEW_DATABASE_URL=.*host=\$\{PREVIEW_SOCKET_URI\}/);
  assert.match(runner, /PREVIEW_SCHEMA_027_READY/);
  assert.match(image, /run-preview-migrations/);
});
