import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('media infrastructure is isolated from the legacy root Terraform state', async () => {
  const root = await read('../infra/iac/main.tf');
  const media = await read('../infra/iac/media/main.tf');
  assert.doesNotMatch(root, /google_storage_bucket" "media/);
  assert.match(media, /google_storage_bucket" "media/);
});

test('media plan requires protected remote state and performs no apply', async () => {
  const script = await read('../scripts/plan-media-storage.sh');
  assert.match(script, /TF_STATE_BUCKET:\?TF_STATE_BUCKET is required/);
  assert.match(script, /publicAccessPrevention == "enforced"/);
  assert.match(script, /uniformBucketLevelAccess\.enabled == true/);
  assert.match(script, /versioning\.enabled == true/);
  assert.match(script, /terraform -chdir=infra\/iac\/media plan/);
  assert.match(script, /EXISTING_MEDIA_BUCKET_REQUIRES_REVIEWED_IMPORT/);
  assert.doesNotMatch(script, /terraform -chdir=infra\/iac\/media apply/);
});

test('Terraform state and saved plans cannot be committed', async () => {
  const ignore = await read('../.gitignore');
  assert.match(ignore, /\*\.tfstate/);
  assert.match(ignore, /\*\.tfplan/);
});
