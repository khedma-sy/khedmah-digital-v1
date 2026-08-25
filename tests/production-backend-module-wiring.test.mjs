import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('professional profile module imports the exported operations RBAC provider', async () => {
  const professionalModule = await read('apps/backend/src/professional-profiles/professional-profiles.module.ts');
  const operationsModule = await read('apps/backend/src/operations-product/operations-product.module.ts');

  assert.match(professionalModule, /imports:\s*\[[^\]]*OperationsProductModule/);
  assert.match(operationsModule, /exports:\s*\[[^\]]*OperationsRbacService/);
});

test('moderation can resolve business and professional profile services from imported modules', async () => {
  const businessModule = await read('apps/backend/src/business-profiles/business-profiles.module.ts');
  const professionalModule = await read('apps/backend/src/professional-profiles/professional-profiles.module.ts');
  const moderationModule = await read('apps/backend/src/moderation/moderation.module.ts');

  assert.match(businessModule, /exports:\s*\[[^\]]*BusinessProfileService/);
  assert.match(professionalModule, /exports:\s*\[[^\]]*ProfessionalProfileService/);
  assert.match(moderationModule, /imports:\s*\[[^\]]*BusinessProfilesModule/);
  assert.match(moderationModule, /imports:\s*\[[^\]]*ProfessionalProfilesModule/);
});
