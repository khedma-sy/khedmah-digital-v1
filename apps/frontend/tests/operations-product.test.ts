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
