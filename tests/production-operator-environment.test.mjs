import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const operatorPath = '.github/workflows/production-operator-new-account.yml';

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

test('new-account production operator is manual and locked to latest main', () => {
  const workflow = readFileSync(operatorPath, 'utf8');
  assert.doesNotMatch(workflow, /push:|schedule:|pull_request:/);
  assert.match(workflow, /default: VERIFY_ONLY/);
  assert.match(workflow, /inputs\.mode == 'DEPLOY_PRODUCTION'/);
  assert.match(workflow, /git fetch origin main/);
  assert.match(workflow, /git rev-parse origin\/main/);
});

test('new-account deployment uses project-owned Cloud Build source staging', () => {
  const workflow = readFileSync(operatorPath, 'utf8');
  assert.match(workflow, /OPERATIONS_BUILD_SERVICE_ACCOUNT: \$\{\{ vars\.OPERATIONS_BUILD_SERVICE_ACCOUNT \}\}/);
  assert.match(workflow, /projects\/\$\{GOOGLE_CLOUD_PROJECT\}\/serviceAccounts\/\$\{OPERATIONS_BUILD_SERVICE_ACCOUNT\}/);
  assert.doesNotMatch(workflow, /gcloud builds get-default-service-account/);
  assert.match(workflow, /gs:\/\/\$\{GOOGLE_CLOUD_PROJECT\}-cloudbuild-source\/source/);
  assert.match(workflow, /cloudbuild\.production-new-account\.yaml/);
});

test('new-account operator injects media, runtime, API and CORS configuration', () => {
  const workflow = readFileSync(operatorPath, 'utf8');
  for (const token of [
    'OPERATIONS_RUNTIME_SERVICE_ACCOUNT: ${{ vars.OPERATIONS_RUNTIME_SERVICE_ACCOUNT }}',
    'GCS_MEDIA_BUCKET: ${{ vars.GCS_MEDIA_BUCKET }}',
    'NEXT_PUBLIC_API_URL: ${{ vars.NEXT_PUBLIC_API_URL }}',
    'CORS_ORIGIN: ${{ vars.CORS_ORIGIN }}',
    'NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL }}'
  ]) assert.ok(workflow.includes(token), `missing ${token}`);
  assert.match(workflow, /_RUNTIME_SERVICE_ACCOUNT=\$OPERATIONS_RUNTIME_SERVICE_ACCOUNT/);
  assert.match(workflow, /_GCS_MEDIA_BUCKET=\$GCS_MEDIA_BUCKET/);
  assert.match(workflow, /_NEXT_PUBLIC_API_URL=\$NEXT_PUBLIC_API_URL/);
  assert.match(workflow, /_CORS_ORIGIN=\$CORS_ORIGIN/);
  assert.match(workflow, /_SITE_URL=\$NEXT_PUBLIC_SITE_URL/);
  assert.match(workflow, /npm run validate:identity:production/);
  assert.doesNotMatch(workflow, /validate:firebase:production/);
});

test('production deployment proves the JavaScript map reaches ready state in Chrome', () => {
  const workflow = readFileSync(operatorPath, 'utf8');
  assert.match(workflow, /google-chrome/);
  assert.match(workflow, /--virtual-time-budget=25000/);
  assert.match(workflow, /data-map-status=\\?"ready\\?"/);
  assert.match(workflow, /MAP_STATUS=ready/);
});

test('VERIFY_ONLY checks live deployment prerequisites without deploying', () => {
  const workflow = readFileSync(operatorPath, 'utf8');
  const readiness = readFileSync('scripts/validate-production-deployment-readiness.sh', 'utf8');
  assert.match(workflow, /Verify Google\/Firebase\/operations readiness/);
  assert.match(workflow, /bash scripts\/validate-production-deployment-readiness\.sh/);
  assert.match(readiness, /OPERATIONS_BUILD_SERVICE_ACCOUNT/);
  assert.match(readiness, /gcloud iam service-accounts describe/);
  assert.doesNotMatch(readiness, /gcloud builds get-default-service-account/);
  assert.match(readiness, /gcloud artifacts repositories describe/);
  assert.match(readiness, /gcloud run services describe/);
  assert.match(readiness, /gcloud sql instances describe/);
  assert.match(readiness, /gcloud secrets versions describe latest/);
  assert.doesNotMatch(readiness, /secrets versions access|gcloud builds submit|gcloud run deploy/);
});
