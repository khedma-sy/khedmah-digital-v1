import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/terraform-media-apply.yml', import.meta.url),
  'utf8',
);
const productionOperator = await readFile(
  new URL('../infra/iac/production_operator.tf', import.meta.url),
  'utf8',
);

test('media apply is manual, production protected, and pinned to reviewed evidence for the requested main SHA', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /REQUESTED_SHA: \$\{\{ inputs\.commit_sha \}\}/);
  assert.match(workflow, /REQUESTED_PLAN_RUN_ID: \$\{\{ inputs\.plan_run_id \}\}/);
  assert.match(workflow, /test "\$\(git rev-parse origin\/main\)" = "\$REQUESTED_SHA"/);
  assert.match(workflow, /name: terraform-media-plan-\$\{\{ inputs\.commit_sha \}\}/);
  assert.match(workflow, /run-id: \$\{\{ inputs\.plan_run_id \}\}/);
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
  assert.match(workflow, /APPLY_KHEDMAH_MEDIA_\$\{REQUESTED_SHA:0:7\}/);
  assert.doesNotMatch(workflow, /APPROVED_SHA:|APPROVED_PLAN_RUN_ID:|project-94512a0e-1a5e-4bdb-87f/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
});

test('production WIF trusts only the reviewed main workflows', () => {
  assert.match(productionOperator, /"attribute\.workflow_ref" = "assertion\.workflow_ref"/);
  assert.match(productionOperator, /assertion\.workflow_ref in \[/);
  assert.doesNotMatch(productionOperator, /job_workflow_ref/);
  assert.match(productionOperator, /production-operator\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /terraform-media-apply\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /terraform-media-plan\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /terraform-media-state-handoff\.yml@refs\/heads\/main/);
  assert.doesNotMatch(productionOperator, /\.github\/workflows\/\*@/);
});

test('media apply validates dynamic account identity and state before apply', () => {
  const approval = workflow.indexOf('Validate request contract before authentication');
  const firstInit = workflow.indexOf('terraform -chdir=infra/iac/media init');
  const apply = workflow.indexOf('terraform -chdir=infra/iac/media apply');
  assert.ok(approval >= 0 && approval < firstInit && firstInit < apply);
  assert.match(workflow, /GOOGLE_CLOUD_PROJECT: \$\{\{ vars\.GOOGLE_CLOUD_PROJECT \}\}/);
  assert.match(workflow, /GCS_MEDIA_BUCKET: \$\{\{ vars\.GCS_MEDIA_BUCKET \}\}/);
  assert.match(workflow, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT: \$\{\{ vars\.OPERATIONS_RUNTIME_SERVICE_ACCOUNT \}\}/);
  assert.match(workflow, /EXPECTED_MEDIA_LINEAGE/);
  assert.match(workflow, /EXPECTED_MEDIA_SERIAL/);
  assert.match(workflow, /\.project == \$project/);
  assert.match(workflow, /\.name == \$bucket/);
  assert.match(workflow, /\.member == \$member/);
  assert.match(workflow, /test -z "\$\(gcloud storage buckets list/);
});

test('media apply uses only saved plan and verifies private post-apply state', () => {
  assert.match(workflow, /apply -input=false -lock-timeout=60s "\$PLAN_FILE"/);
  assert.doesNotMatch(workflow, /terraform -chdir=infra\/iac\/media plan/);
  assert.match(workflow, /MEDIA_BUCKET_APPLY_VERIFIED/);
  assert.match(workflow, /allUsers/);
  assert.match(workflow, /public_access_prevention/);
  assert.match(workflow, /retentionDurationSeconds/);
  assert.doesNotMatch(workflow, /gcloud builds submit|run deploy|DEPLOY_PRODUCTION|build-android/);
});
