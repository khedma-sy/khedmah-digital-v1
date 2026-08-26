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

test('media apply is manual, production protected, and pinned to reviewed evidence', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /APPROVED_SHA: 6f53ed3/);
  assert.match(workflow, /APPROVED_PLAN_RUN_ID: "33019789431"/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /run-id: \$\{\{ inputs\.plan_run_id \}\}/);
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
  assert.match(workflow, /git diff --name-only "\$APPROVED_SHA" origin\/main/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
});

test('production WIF trusts only the four reviewed main workflows', () => {
  assert.match(productionOperator, /assertion\.job_workflow_ref in \[/);
  assert.match(productionOperator, /production-operator\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /terraform-media-apply\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /terraform-media-plan\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /terraform-media-state-handoff\.yml@refs\/heads\/main/);
  assert.doesNotMatch(productionOperator, /\.github\/workflows\/\*@/);
});

test('media apply validates approvals and both state identities before init and apply', () => {
  const approval = workflow.indexOf('Reject unapproved request before checkout or authentication');
  const firstInit = workflow.indexOf('terraform -chdir=infra/iac init');
  const apply = workflow.indexOf('terraform -chdir=infra/iac/media apply');
  assert.ok(approval >= 0 && approval < firstInit && firstInit < apply);
  assert.match(workflow, /EXPECTED_ROOT_LINEAGE/);
  assert.match(workflow, /EXPECTED_ROOT_SERIAL/);
  assert.match(workflow, /EXPECTED_MEDIA_LINEAGE/);
  assert.match(workflow, /EXPECTED_MEDIA_SERIAL/);
  assert.match(workflow, /\(\.resources \| length\) == 0/);
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
