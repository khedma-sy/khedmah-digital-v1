import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('production operator is a gated manual deployment workflow', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-production-operator.mjs'], { encoding: 'utf8' });
  assert.match(output, /gated deployment contract valid/);
});

test('production deployer can consume enabled Google APIs', () => {
  for (const file of ['infra/iac/main.tf', 'infra/iac/bootstrap/main.tf']) {
    const terraform = readFileSync(file, 'utf8');
    assert.match(terraform, /roles\/serviceusage\.serviceUsageConsumer/);
  }
});

test('deployment summary treats markdown backticks as text', () => {
  const workflow = readFileSync('.github/workflows/production-operator.yml', 'utf8');
  assert.match(workflow, /printf -- '- Commit: `%s`/);
  assert.doesNotMatch(workflow, /echo "- Commit: `/);
});

test('default Cloud Build account is normalized to a resource name', () => {
  const workflow = readFileSync('.github/workflows/production-operator.yml', 'utf8');
  assert.ok(workflow.includes('BUILD_SERVICE_ACCOUNT="projects/${GOOGLE_CLOUD_PROJECT}/serviceAccounts/${BUILD_SERVICE_ACCOUNT}"'));
});

test('production source is staged in a project-owned bucket', () => {
  const workflow = readFileSync('.github/workflows/production-operator.yml', 'utf8');
  assert.ok(workflow.includes('SOURCE_STAGING_DIR="gs://${GOOGLE_CLOUD_PROJECT}-cloudbuild-source/source"'));
  assert.ok(workflow.includes('--gcs-source-staging-dir "$SOURCE_STAGING_DIR"'));
});

test('production operator deploys the planned media bucket and runtime identity', () => {
  const workflow = readFileSync('.github/workflows/production-operator.yml', 'utf8');
  assert.match(workflow, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT: \$\{\{ vars\.OPERATIONS_RUNTIME_SERVICE_ACCOUNT \}\}/);
  assert.match(workflow, /GCS_MEDIA_BUCKET: \$\{\{ vars\.GCS_MEDIA_BUCKET \}\}/);
  assert.match(workflow, /test -n "\$OPERATIONS_RUNTIME_SERVICE_ACCOUNT"/);
  assert.match(workflow, /test -n "\$GCS_MEDIA_BUCKET"/);
  assert.match(
    workflow,
    /--substitutions "COMMIT_SHA=\$REQUESTED_SHA,_RUNTIME_SERVICE_ACCOUNT=\$OPERATIONS_RUNTIME_SERVICE_ACCOUNT,_GCS_MEDIA_BUCKET=\$GCS_MEDIA_BUCKET"/,
  );
});

test('VERIFY_ONLY checks the live private media contract without deploying', () => {
  const workflow = readFileSync('.github/workflows/production-operator.yml', 'utf8');
  assert.match(workflow, /Verify private media storage readiness/);
  assert.match(workflow, /bash scripts\/validate-media-storage-readiness\.sh/);
  assert.match(workflow, /GCS_MEDIA_LOCATION: \$\{\{ vars\.GCS_MEDIA_LOCATION \}\}/);
  assert.match(workflow, /if: \$\{\{ inputs\.mode == 'DEPLOY_PRODUCTION' \}\}/);
});

test('VERIFY_ONLY checks live deployment prerequisites without reading secret payloads', () => {
  const workflow = readFileSync('.github/workflows/production-operator.yml', 'utf8');
  const readiness = readFileSync('scripts/validate-production-deployment-readiness.sh', 'utf8');
  assert.match(workflow, /Verify deployment prerequisites without deploying/);
  assert.match(workflow, /bash scripts\/validate-production-deployment-readiness\.sh/);
  assert.match(readiness, /gcloud builds get-default-service-account/);
  assert.match(readiness, /gcloud artifacts repositories describe/);
  assert.match(readiness, /gcloud run services describe/);
  assert.match(readiness, /gcloud sql instances describe/);
  assert.match(readiness, /gcloud secrets versions describe latest/);
  assert.doesNotMatch(readiness, /secrets versions access|gcloud builds submit|gcloud run deploy/);
  assert.match(readiness, /READY: SECRET_METADATA_COUNT=/);
});

test('production operator cannot deploy from an automatic repository event', () => {
  const workflow = execFileSync('cat', ['.github/workflows/production-operator.yml'], { encoding: 'utf8' });
  assert.doesNotMatch(workflow, /push:|schedule:|pull_request:/);
  assert.match(workflow, /default: VERIFY_ONLY/);
  assert.match(workflow, /inputs\.mode == 'DEPLOY_PRODUCTION'/);
  assert.match(workflow, /test "\$REQUESTED_SHA" = "\$MAIN_SHA"/);
});
