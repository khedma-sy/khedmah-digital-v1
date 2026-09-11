import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Operations Product dashboard is permission-gated and renders reported backend configuration without certifying live health', async () => {
  const page = await readFile(new URL('../app/admin/operations-product/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /api\.operationsProduct\.overview\(\)/);
  assert.match(page, /status === 401/);
  assert.match(page, /status === 403/);
  assert.match(page, /overview\.services\.map/);
  assert.match(page, /overview\.openIncidents/);
  assert.match(page, /overview\.pendingChanges/);
  assert.match(page, /overview\.permissions\.includes\('security\.manage'\)/);
  assert.match(page, /canManageModeration \? <Link href="\/admin\/moderation"/);
  assert.doesNotMatch(page, /<strong>0<\/strong>|disabled title=|حالة الخدمات الفعلية|خدمات مراقبة/);
  assert.match(page, /ليس فحصاً حياً/);
  assert.match(page, /مؤقتة في ذاكرة عملية الخادم/);
});
