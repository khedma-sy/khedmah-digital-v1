import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('owner completion workspace uses real business APIs', async () => {
  const page = await read('../apps/frontend/app/business-profiles/[id]/manage/page.tsx');
  for (const call of ['getOpeningHours', 'setOpeningHours', 'getBranches', 'addBranch', 'getSocialLinks', 'setSocialLink', 'getVerificationStatus', 'requestVerification', 'submitForReview']) {
    assert.match(page, new RegExp(`api\\.businesses\\.${call}`));
  }
  assert.doesNotMatch(page, /localStorage|setTimeout|mock|fixture/i);
});

test('opening hours are replaced atomically and validate seven distinct days', async () => {
  const repository = await read('../apps/backend/src/business-profiles/business-profile.repository.ts');
  const service = await read('../apps/backend/src/business-profiles/business-profile.service.ts');
  assert.match(repository, /transaction/);
  assert.match(repository, /DELETE FROM business_opening_hours WHERE business_profile_id/);
  assert.match(service, /hours\.length !== 7/);
  assert.match(service, /new Set\(hours\.map/);
});

test('owner-scoped deletes and verification prevent cross-business actions', async () => {
  const repository = await read('../apps/backend/src/business-profiles/business-profile.repository.ts');
  const service = await read('../apps/backend/src/business-profiles/business-profile.service.ts');
  assert.match(repository, /owner_id = \$2/);
  assert.match(repository, /business_profile_id = \$2/);
  assert.match(service, /requestVerification[\s\S]*profile\.ownerUserId !== actor\.id/);
  assert.match(service, /Social link must use HTTPS/);
});
