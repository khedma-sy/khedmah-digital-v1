import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('professional workspace uses shared primitives instead of legacy inline UI', async () => {
  const page = await read('apps/frontend/app/professional-profiles/page.tsx');
  assert.match(page, /PageShell/);
  assert.match(page, /PageHeader/);
  assert.match(page, /StatusMessage/);
  assert.match(page, /Surface/);
  assert.doesNotMatch(page, /style=\{\{/);
  assert.doesNotMatch(page, /alert\(/);
  assert.doesNotMatch(page, /🟢|🟡|🔴|👤/);
});

test('business and professional owner spaces share the same workspace design layer', async () => {
  const business = await read('apps/frontend/app/business-profiles/page.tsx');
  const professional = await read('apps/frontend/app/professional-profiles/page.tsx');
  const styles = await read('apps/frontend/components/owner-workspace.module.css');
  assert.match(business, /owner-workspace\.module\.css/);
  assert.match(professional, /owner-workspace\.module\.css/);
  assert.match(styles, /--workspace-accent:/);
  assert.match(styles, /\.workspaceGrid/);
  assert.match(styles, /\.skillList/);
});

test('public professional profile stays navy-led and responsive', async () => {
  const styles = await read('apps/frontend/app/professional-profiles/[id]/professional-profile.module.css');
  assert.match(styles, /--profile-accent:var\(--brand-navy,#173247\)/);
  assert.match(styles, /@media\(max-width:52rem\)/);
  assert.match(styles, /@media\(max-width:38rem\)/);
  assert.match(styles, /object-fit:contain/);
});
