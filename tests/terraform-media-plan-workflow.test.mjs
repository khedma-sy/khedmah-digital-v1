import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/terraform-media-plan.yml', import.meta.url),
  'utf8',
);

test('media plan is a manual production WIF gate locked to latest main', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
});

test('media plan binds the reviewed production state and resource identities', () => {
  assert.match(workflow, /TF_STATE_PREFIX: khedmah\/production\/media/);
  assert.match(workflow, /LEGACY_ROOT_STATE_LINEAGE/);
  assert.match(workflow, /LEGACY_ROOT_STATE_SERIAL/);
  assert.match(workflow, /test "\$TF_STATE_BUCKET" != "\$GCS_MEDIA_BUCKET"/);
  assert.match(workflow, /GCS_MEDIA_LOCATION/);
  assert.match(workflow, /GCS_MEDIA_BUCKET/);
  assert.match(workflow, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT/);
  assert.match(workflow, /bash scripts\/plan-media-storage\.sh/);
});

test('media plan publishes review evidence but cannot apply or deploy', () => {
  assert.match(workflow, /khedmah-media-plan-summary\.json/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /Apply\/deployment: `NOT PERFORMED`/);
  assert.doesNotMatch(workflow, /terraform[^\n]*\bapply\b/);
  assert.doesNotMatch(workflow, /gcloud builds submit|run deploy|DEPLOY_PRODUCTION/);
});
