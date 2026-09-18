import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const deploy = await readFile(new URL('../scripts/google-production-deploy.sh', import.meta.url), 'utf8');
const rollback = await readFile(new URL('../scripts/google-production-rollback.sh', import.meta.url), 'utf8');
const certification = await readFile(new URL('../scripts/run-live-production-certification.sh', import.meta.url), 'utf8');
const evidence = await readFile(new URL('../scripts/collect-live-production-evidence.sh', import.meta.url), 'utf8');

test('manual Production deployment is explicitly approved, project-bound and locked to latest main', () => {
  assert.match(deploy, /OPERATIONS_APPROVED_PRODUCTION/);
  assert.match(deploy, /PRODUCTION_GOOGLE_CLOUD_PROJECT/);
  assert.match(deploy, /GOOGLE_CLOUD_PROJECT.*PRODUCTION_GOOGLE_CLOUD_PROJECT/s);
  assert.match(deploy, /git status --porcelain/);
  assert.match(deploy, /git fetch origin main/);
  assert.match(deploy, /COMMIT_SHA.*MAIN_SHA/s);
  assert.match(deploy, /gcloud auth list/);
  assert.match(deploy, /OPERATIONS_DEPLOYER_SERVICE_ACCOUNT/);
  assert.match(deploy, /OPERATIONS_BUILD_SERVICE_ACCOUNT/);
  assert.match(deploy, /BUILD_SERVICE_ACCOUNT="projects\/\$\{GOOGLE_CLOUD_PROJECT\}\/serviceAccounts\/\$\{OPERATIONS_BUILD_SERVICE_ACCOUNT\}"/);
  assert.doesNotMatch(deploy, /gcloud builds get-default-service-account/);
  assert.match(deploy, /--gcs-source-staging-dir/);
  assert.match(deploy, /COMMIT_SHA=\$\{COMMIT_SHA\}/);
  assert.match(deploy, /_SITE_URL=\$\{NEXT_PUBLIC_SITE_URL\}/);
  assert.match(deploy, /cloudbuild\.production-new-account\.yaml/);
  assert.doesNotMatch(deploy, /_OPERATIONS_PRODUCT_ROLE_BINDINGS=/);
});

test('Production revision switch is paired, validates revision ownership and compensates partial traffic changes', () => {
  assert.match(rollback, /usage: google-production-rollback\.sh BACKEND_REVISION FRONTEND_REVISION/);
  assert.match(rollback, /OPERATIONS_APPROVED_PRODUCTION/);
  assert.match(rollback, /PRODUCTION_GOOGLE_CLOUD_PROJECT/);
  assert.match(rollback, /revision_exists_for_service/);
  assert.match(rollback, /single_serving_revision/);
  assert.match(rollback, /traffic\.length !== 1/);
  assert.match(rollback, /Number\(traffic\[0\]\.percent\) !== 100/);
  assert.match(rollback, /compensate_partial_switch/);
  assert.match(rollback, /previous_backend_revision/);
  assert.match(rollback, /previous_frontend_revision/);
  assert.match(rollback, /api\/v1\/health\/ready/);
  assert.match(rollback, /Database state was not rolled back/);
});

test('live Production certification observes serving traffic and fails back to the previous pair on error', () => {
  assert.match(certification, /serving_revision/);
  assert.match(certification, /traffic\.length !== 1/);
  assert.match(certification, /Number\(traffic\[0\]\.percent\) !== 100/);
  assert.match(certification, /emergency_restore/);
  assert.match(certification, /google-production-rollback\.sh "\$before_backend" "\$before_frontend"/);
  assert.match(certification, /google-production-rollback\.sh "\$after_backend" "\$after_frontend"/);
  assert.doesNotMatch(certification, /gcloud run services update-traffic/);
  assert.match(certification, /collect-live-production-evidence\.sh/);
});

test('live evidence collection is bound to the explicit Production project and deployer identity', () => {
  assert.match(evidence, /PRODUCTION_GOOGLE_CLOUD_PROJECT/);
  assert.match(evidence, /GOOGLE_CLOUD_PROJECT.*PRODUCTION_GOOGLE_CLOUD_PROJECT/s);
  assert.match(evidence, /gcloud auth list/);
  assert.match(evidence, /active_account.*OPERATIONS_DEPLOYER_SERVICE_ACCOUNT/s);
  assert.match(evidence, /alert-policies\.json/);
  assert.match(evidence, /logging-signal\.json/);
  assert.match(evidence, /certificates\.json/);
  assert.match(evidence, /dns-zones\.json/);
  assert.doesNotMatch(evidence, /secrets versions access/);
});


test('live validation distinguishes GCP Secret Manager values from CI-only OAuth clients', async () => {
  const liveValidation = await readFile(new URL('../scripts/production-operator-live-validation.sh', import.meta.url), 'utf8');
  assert.match(liveValidation, /gcp_secret_names=\(/);
  assert.match(liveValidation, /GOOGLE_OAUTH_SERVER_CLIENT_ID/);
  assert.match(liveValidation, /GOOGLE_MAPS_ANDROID_API_KEY/);
  const secretBlock = liveValidation.split('gcp_secret_names=(')[1]?.split(')')[0] ?? '';
  assert.doesNotMatch(secretBlock, /GOOGLE_OAUTH_WEB_CLIENT_ID/);
  assert.doesNotMatch(secretBlock, /GOOGLE_OAUTH_ANDROID_CLIENT_ID/);
});


test('live certification uses stable Cloud Monitoring CLI surface', async () => {
  const live = await read('../scripts/production-operator-live-validation.sh');
  assert.match(live, /gcloud monitoring policies list/);
  assert.doesNotMatch(live, /gcloud alpha monitoring policies list/);
});
