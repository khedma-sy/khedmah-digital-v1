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


test('staging Cloud Build uses the project-owned source bucket without changing Preview staging', () => {
  const script = readFileSync('scripts/deployment/deploy-cloud-run-environment.sh', 'utf8');
  assert.match(script, /if \[\[ "\$environment" == "staging" \]\]; then/);
  assert.match(script, /--gcs-source-staging-dir "gs:\/\/\$\{GOOGLE_CLOUD_PROJECT\}-cloudbuild-source\/source"/);
  assert.match(script, /"\$\{cloudbuild_source_args\[@\]\}" --config "cloudbuild\.\$\{environment\}-backend\.yaml"/);
  assert.match(script, /"\$\{cloudbuild_source_args\[@\]\}" --config "\$config"/);
});


test('non-production deploy applies Product Store 024 before Classifieds 025', () => {
  const deploy = readFileSync('scripts/deployment/deploy-cloud-run-environment.sh', 'utf8');
  const productStore = deploy.indexOf('ensure-product-store-nonproduction-schema.sh');
  const classifieds = deploy.indexOf('ensure-classifieds-nonproduction-schema.sh');
  assert.ok(productStore >= 0);
  assert.ok(classifieds > productStore);

  const ensure = readFileSync('scripts/deployment/ensure-product-store-nonproduction-schema.sh', 'utf8');
  const runner = readFileSync('scripts/deployment/run-product-store-nonproduction-migration.sh', 'utf8');
  assert.match(ensure, /Refusing Product Store schema operation on Production/);
  assert.match(runner, /Refusing Product Store migration 024 against Production/);
  assert.match(runner, /MIGRATION_024_REQUIRES_SCHEMA_022/);
  assert.match(runner, /MIGRATION_024_APPLIED_AND_VERIFIED/);
});
