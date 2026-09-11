import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('moderation decisions use internal dialogs instead of browser prompts', async () => {
  const page = await read('apps/frontend/app/admin/moderation/page.tsx');
  assert.doesNotMatch(page, /\bprompt\s*\(/);
  assert.doesNotMatch(page, /\balert\s*\(/);
  assert.doesNotMatch(page, /\bconfirm\s*\(/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /moderation-feedback/);
});

test('moderation styles are isolated and loaded after admin system styles', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const admin = layout.indexOf("./admin-system.css");
  const moderation = layout.indexOf("./moderation-system.css");
  assert.ok(admin >= 0);
  assert.ok(moderation > admin);
});
