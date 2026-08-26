import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('GCS media stays private and is delivered through the backend visibility gate', async () => {
  const storage = await read('../apps/backend/src/media/storage.adapter.ts');
  const service = await read('../apps/backend/src/media/media.service.ts');
  const controller = await read('../apps/backend/src/media/media.controller.ts');
  assert.doesNotMatch(storage, /predefinedAcl=publicRead/);
  assert.match(storage, /\?alt=media/);
  assert.match(service, /visibility = 'public'/);
  assert.match(service, /`\/api\/v1\/media\/public\/\$\{id\}`/);
  assert.match(controller, /@Get\('public\/:id'\)/);
});

test('Terraform governs a private uniform-access media bucket and least-privilege runtime access', async () => {
  const terraform = await read('../infra/iac/main.tf');
  const readiness = await read('../scripts/validate-media-storage-readiness.sh');
  assert.match(terraform, /resource "google_storage_bucket" "media"/);
  assert.match(terraform, /uniform_bucket_level_access = true/);
  assert.match(terraform, /public_access_prevention\s+= "enforced"/);
  assert.match(terraform, /roles\/storage\.objectAdmin/);
  assert.doesNotMatch(terraform, /allUsers/);
  assert.match(readiness, /allUsers/);
  assert.match(readiness, /PRIVATE_MEDIA_BUCKET/);
});
