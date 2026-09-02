import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Operations Product dashboard is permission-gated and renders live backend state', async () => {
  const page = await readFile(new URL('../app/admin/operations-product/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /api\.operationsProduct\.overview\(\)/);
  assert.match(page, /status === 401/);
  assert.match(page, /status === 403/);
  assert.match(page, /overview\.services\.map/);
  assert.match(page, /overview\.openIncidents/);
  assert.match(page, /overview\.pendingChanges/);
  assert.match(page, /overview\.permissions\.includes\('security\.manage'\)/);
  assert.match(page, /canManageModeration \? <Link href="\/admin\/moderation"/);
  assert.doesNotMatch(page, /<strong>0<\/strong>|disabled title=/);
});

test('smart admin is aggregated, privacy-preserving and human-controlled', async () => {
  const [page, client, admin] = await Promise.all([
    readFile(new URL('../app/admin/smart-report/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/api-client.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(page, /api\.operationsProduct\.smartAdminReport/);
  assert.match(page, /مراجعة بشرية إلزامية/);
  assert.match(page, /لا يعرض التقرير هوية المستخدم/);
  assert.match(client, /minimumSearchCohort/);
  assert.match(client, /rawUserTextExposed: false/);
  assert.match(client, /api\.analytics|recordSearch/);
  assert.match(admin, /href="\/admin\/smart-report"/);
});
