import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Classifieds moderation fails closed when the Smart Admin assessment is absent, stale, or outside the approved contract', async () => {
  const page = await read('../app/admin/moderation/page.tsx');

  assert.match(page, /assessment\.version === CLASSIFIEDS_SMART_ADMIN_VERSION/);
  assert.match(page, /assessment\.reviewRevision === ad\.reviewRevision/);
  assert.match(page, /assessment\.humanDecisionRequired === true/);
  assert.match(page, /assessment\.automatedDecisionAllowed === false/);
  assert.doesNotMatch(page, /!ad\.smartAdmin\s*\|\|/);
  assert.match(page, /disabled=\{actionLoading \|\| !decisionReady\}/);
  assert.match(page, /تقييم Smart Admin مفقود أو قديم أو بعقد غير معتمد/);
});

test('a moderation decision carries the exact Smart Admin assessment version reviewed by the human operator', async () => {
  const page = await read('../app/admin/moderation/page.tsx');
  const client = await read('../lib/classifieds-client.ts');

  assert.match(page, /assessmentVersion: ad\.smartAdmin\.version/);
  assert.match(page, /dialogAction\.assessmentVersion/);
  assert.match(client, /expectedAssessmentVersion: AdModerationAssessment\['version'\]/);
  assert.match(client, /expectedAssessmentVersion,/);
  assert.match(client, /CLASSIFIEDS_SMART_ADMIN_VERSION = 'classifieds-smart-admin-v1'/);
});
