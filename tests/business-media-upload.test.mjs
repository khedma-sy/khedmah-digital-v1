import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('business media upload is real, owner-scoped and typed', async () => {
  const service = await read('../apps/backend/src/media/media.service.ts');
  const validation = await read('../apps/backend/src/media/media.validation.ts');
  assert.match(service, /assertOwner\(actor\.id/);
  assert.match(service, /asset_type, sort_order/);
  assert.match(service, /matchesMimeSignature/);
  assert.match(validation, /Business media requires logo, cover, or gallery/);
  assert.match(validation, /5 \* 1024 \* 1024/);
});

test('owner workspace uploads files without image URL fields', async () => {
  const page = await read('../apps/frontend/app/business-profiles/[id]/manage/page.tsx');
  const client = await read('../apps/frontend/lib/api-client.ts');
  assert.match(page, /type="file"/);
  assert.match(page, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(page, /api\.media\.uploadBusiness/);
  assert.match(page, /api\.media\.delete/);
  assert.match(client, /ownerType: 'business_profile'/);
  assert.doesNotMatch(page, /رابط الصورة|image url/i);
});

test('new-account production deployment requires an injected dedicated media bucket', async () => {
  const cloudBuild = await read('../cloudbuild.production-new-account.yaml');
  assert.match(cloudBuild, /GCS_MEDIA_BUCKET=\$\{_GCS_MEDIA_BUCKET\}/);
  assert.match(cloudBuild, /_GCS_MEDIA_BUCKET: REQUIRED_GCS_MEDIA_BUCKET/);
  assert.match(cloudBuild, /_GCS_MEDIA_BUCKET: REQUIRED_GCS_MEDIA_BUCKET/);
});
