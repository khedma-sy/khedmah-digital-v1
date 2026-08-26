import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('organization workspace uses the shared Khedmah identity without legacy inline styling', async () => {
  const files = await Promise.all([
    read('apps/frontend/app/organizations/page.tsx'),
    read('apps/frontend/app/organizations/new/page.tsx'),
    read('apps/frontend/app/organizations/[id]/page.tsx')
  ]);
  for (const source of files) {
    assert.match(source, /PageShell/);
    assert.match(source, /owner-workspace\.module\.css/);
    assert.doesNotMatch(source, /identity-shell|identity-card|foundation-action|style=\{\{/);
    assert.doesNotMatch(source, /Khedmah Digital|خدمة ديجتل/);
  }
});

test('organization details use real APIs and contain no simulated persistence', async () => {
  const [details, client] = await Promise.all([
    read('apps/frontend/app/organizations/[id]/page.tsx'),
    read('apps/frontend/lib/api-client.ts')
  ]);
  assert.match(details, /api\.organizations\.get\(id\)/);
  assert.match(details, /api\.organizations\.update\(id/);
  assert.match(details, /api\.organizations\.listMembers\(id\)/);
  assert.match(details, /api\.organizations\.addMember\(id/);
  assert.match(details, /api\.organizations\.removeMember\(id/);
  assert.doesNotMatch(details, /setTimeout|localStorage|Production Test/);
  for (const route of ['/organizations/${encodeURIComponent(id)}', '/members']) assert.match(client, new RegExp(route.replace(/[${}()]/g, '\\$&')));
});

test('organization permissions and sensitive member removal are explicit', async () => {
  const details = await read('apps/frontend/app/organizations/[id]/page.tsx');
  assert.match(details, /ownerUserId === currentUserId/);
  assert.match(details, /window\.confirm/);
  assert.match(details, /يمكن للمالك فقط/);
  assert.match(details, /الجهة ليست نشاطاً عاماً/);
});

test('organization workspace remains responsive and token driven', async () => {
  const css = await read('apps/frontend/components/owner-workspace.module.css');
  assert.match(css, /var\(--k-color-canvas\)/);
  assert.match(css, /\.memberRow/);
  assert.match(css, /@media\(max-width:38rem\)/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
});
