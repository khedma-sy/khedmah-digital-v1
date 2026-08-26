import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/terraform-media-state-handoff.yml', import.meta.url),
  'utf8',
);

test('media state handoff is a manual production WIF gate locked to latest main', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
});

test('handoff verifies protected root state and exact reviewed state identity', () => {
  assert.match(workflow, /prefix=khedmah\/production\/root/);
  assert.match(workflow, /gcloud storage buckets list --project/);
  assert.match(workflow, /gcloud logging read/);
  assert.match(workflow, /storage\.buckets\.create/);
  assert.match(workflow, /--freshness=7d/);
  assert.match(workflow, /protoPayload\.resourceName/);
  assert.match(workflow, /khedmah\/production\/root\/default\.tfstate/);
  assert.match(workflow, /test \"\$\{#state_candidates\[@\]\}\" -eq 1/);
  assert.match(workflow, /uniform_bucket_level_access == true/);
  assert.match(workflow, /uniformBucketLevelAccess\.enabled == true/);
  assert.match(workflow, /public_access_prevention == \"enforced\"/);
  assert.match(workflow, /publicAccessPrevention == \"enforced\"/);
  assert.match(workflow, /versioning_enabled == true/);
  assert.match(workflow, /versioning\.enabled == true/);
  assert.match(workflow, /test \"\$lineage\" = \"\$EXPECTED_LINEAGE\"/);
  assert.match(workflow, /test \"\$serial\" = \"\$EXPECTED_SERIAL\"/);
  assert.match(workflow, /test \"\$bucket_project\" = \"\$GOOGLE_CLOUD_PROJECT\"/);
  assert.match(workflow, /test \"\$bucket_name\" = \"\$iam_bucket\"/);
});

test('fresh root initialization requires absence, explicit confirmation and zero resources', () => {
  assert.match(workflow, /VERIFY_EMPTY_ROOT/);
  assert.match(workflow, /INITIALIZE_EMPTY_ROOT/);
  assert.match(workflow, /ROOT_STATE_ALREADY_EXISTS/);
  assert.match(workflow, /test \"\$CONFIRMATION\" = INITIALIZE_EMPTY_ROOT_STATE/);
  assert.match(workflow, /terraform -chdir=infra\/iac state push/);
  assert.match(workflow, /\.resources \| length == 0/);
});

test('handoff backs up and removes both addresses atomically, then stops', () => {
  const backup = workflow.indexOf('gcloud storage cp "$state_file" "$backup_uri"');
  const removal = workflow.indexOf(
    'terraform -chdir=infra/iac state rm "$bucket_address" "$iam_address"',
  );
  assert.ok(backup >= 0 && removal > backup);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /diff -u \"\$before_addresses\" \"\$after_addresses\"/);
  assert.match(workflow, /no import, plan, apply, or deployment performed/);
  assert.doesNotMatch(workflow, /terraform[^\n]*\b(?:import|plan|apply)\b/);
  assert.doesNotMatch(workflow, /upload-artifact|gcloud builds submit|run deploy/);
});
