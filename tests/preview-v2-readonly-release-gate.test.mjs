import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/preview-v2-readonly-release-gate.yml', import.meta.url), 'utf8');

test('Preview V2 read-only gate requires a distinct dedicated WIF identity', () => {
  assert.match(workflow, /PREVIEW_V2_READONLY_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(workflow, /PREVIEW_V2_READONLY_SERVICE_ACCOUNT/);
  assert.match(workflow, /READONLY_WIF_PROVIDER.*!=.*HISTORICAL_DEPLOYER_WIF_PROVIDER/s);
  assert.match(workflow, /READONLY_SA.*!=.*HISTORICAL_DEPLOYER_SA/s);
  assert.match(workflow, /event_name.*workflow_dispatch/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /preview-v2-readonly-release-gate\.yml@refs\/heads\/main/);
});

test('Preview V2 read-only gate pins exact non-production Cloud Run scope', () => {
  assert.match(workflow, /khedmah-preview-v2-20261012/);
  assert.match(workflow, /1044962071847/);
  assert.match(workflow, /europe-west1/);
  assert.match(workflow, /khedmah-pr-274-backend/);
  assert.match(workflow, /project_verified.*1044962071847/s);
});

test('Preview V2 read-only gate cannot claim release or writer quiescence', () => {
  assert.match(workflow, /writer_quiescence_verified':False/);
  assert.match(workflow, /database_checked':False/);
  assert.match(workflow, /release_authorized':False/);
  assert.match(workflow, /cloud_mutation_performed':False/);
});

test('Preview V2 read-only gate uses read commands only', () => {
  assert.match(workflow, /run','services','describe/);
  assert.match(workflow, /run','revisions','list/);
  assert.doesNotMatch(workflow, /run services update|update-traffic|revisions delete|sql instances patch|projects add-iam-policy-binding|services set-iam-policy/i);
});
