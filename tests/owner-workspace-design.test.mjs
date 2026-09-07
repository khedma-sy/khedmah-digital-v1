import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner creation journeys share the converged workspace system', async () => {
  const styles = await read('apps/frontend/components/owner-workspace.module.css');
  const businessNew = await read('apps/frontend/app/business-profiles/new/page.tsx');
  const professionalNew = await read('apps/frontend/app/professional-profiles/new/page.tsx');
  assert.match(styles, /--owner-accent:\s*var\(--brand-navy\)/i);
  assert.match(styles, /\.guide\{position:sticky/i);
  assert.match(styles, /@media\(max-width:52rem\).*\.guide\{position:static/s);
  assert.match(businessNew, /owner-workspace\.module\.css/);
  assert.match(professionalNew, /owner-workspace\.module\.css/);
});

test('provider management uses shared navy visual hierarchy and mobile stacking', async () => {
  const styles = await read('apps/frontend/app/business-profiles/[id]/manage/provider-core.module.css');
  assert.match(styles, /--manage-accent:\s*var\(--brand-navy,#173247\)/i);
  assert.match(styles, /\.progress\{[^}]*background:var\(--k-color-surface\)/s);
  assert.match(styles, /@media\(max-width:38rem\)/i);
});

test('organizations do not advertise the retired creation route', async () => {
  const list = await read('apps/frontend/app/organizations/page.tsx');
  const retired = await read('apps/frontend/app/organizations/new/page.tsx');
  assert.doesNotMatch(list, /href="\/organizations\/new"/);
  assert.match(list, /إنشاء جهات جديدة غير متاح/);
  assert.match(retired, /redirect\('\/business-profiles'\)/);
});
