import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/terraform-media-apply.yml', import.meta.url), 'utf8');
const productionOperator = await readFile(new URL('../infra/iac/production_operator.tf', import.meta.url), 'utf8');

test('media apply is manual, production protected, and pinned to protected approval variables', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /TF_MEDIA_APPROVED_SHA/);
  assert.match(workflow, /TF_MEDIA_APPROVED_PLAN_RUN_ID/);
  assert.match(workflow, /TF_MEDIA_APPROVED_ARTIFACT_NAME/);
  assert.match(workflow, /test "\$REQUESTED_SHA" = "\$APPROVED_SHA"/);
  assert.match(workflow, /test "\$\(git rev-parse origin\/main\)" = "\$APPROVED_SHA"/);
  assert.match(workflow, /actions\/download-artifact@v8/);
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
});

test('production WIF keeps explicit main workflow allowlist', () => {
  assert.match(productionOperator, /"attribute\.workflow_ref" = "assertion\.workflow_ref"/);
  assert.match(productionOperator, /assertion\.workflow_ref in \[/);
  assert.doesNotMatch(productionOperator, /job_workflow_ref/);
  assert.match(productionOperator, /production-operator-new-account\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /production-baseline-001-020\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /production-bootstrap-admin\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /production-migrations-025-034\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /terraform-media-apply\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /terraform-media-plan\.yml@refs\/heads\/main/);
  assert.match(productionOperator, /terraform-media-state-handoff\.yml@refs\/heads\/main/);
  assert.doesNotMatch(productionOperator, /\.github\/workflows\/\*@/);
});

test('media apply validates both state identities and new-account resource identity', () => {
  const approval = workflow.indexOf('Reject unapproved request before checkout or authentication');
  const firstInit = workflow.indexOf('terraform -chdir=infra/iac init');
  const apply = workflow.indexOf('terraform -chdir=infra/iac/media apply');
  assert.ok(approval >= 0 && approval < firstInit && firstInit < apply);
  assert.match(workflow, /TF_ROOT_STATE_LINEAGE/);
  assert.match(workflow, /TF_MEDIA_STATE_LINEAGE/);
  assert.match(workflow, /--arg project "\$GOOGLE_CLOUD_PROJECT"/);
  assert.match(workflow, /--arg bucket "\$GCS_MEDIA_BUCKET"/);
  assert.match(workflow, /serviceAccount:\$\{OPERATIONS_RUNTIME_SERVICE_ACCOUNT\}/);
  assert.match(workflow, /test -z "\$\(gcloud storage buckets list/);
});

test('media apply uses only saved plan and verifies private post-apply state', () => {
  assert.match(workflow, /apply -input=false -lock-timeout=60s "\$PLAN_FILE"/);
  assert.doesNotMatch(workflow, /terraform -chdir=infra\/iac\/media plan/);
  assert.match(workflow, /MEDIA_BUCKET_APPLY_VERIFIED/);
  assert.match(workflow, /allUsers/);
  assert.match(workflow, /public_access_prevention/);
  assert.ok(workflow.includes('GOOGLE_CLOUD_PROJECT: ${{ vars.GOOGLE_CLOUD_PROJECT }}'));
  assert.doesNotMatch(workflow, /gcloud builds submit|run deploy|DEPLOY_PRODUCTION|build-android/);
});
