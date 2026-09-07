import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('administration uses a dedicated convergence layer after shared primitives', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const admin = await read('apps/frontend/app/admin-system.css');
  assert.ok(layout.indexOf("./admin-system.css") > layout.indexOf("./ui-primitives.css"));
  assert.match(admin, /\.operations-shell\{/);
  assert.match(admin, /\.operations-summary\{/);
  assert.match(admin, /@media\(max-width:38rem\)/);
});

test('admin product logic remains permission-gated', async () => {
  const page = await read('apps/frontend/app/admin/page.tsx');
  assert.match(page, /overview\.permissions\.includes\('security\.manage'\)/);
  assert.match(page, /api\.operationsProduct\.overview\(\)/);
  assert.match(page, /\/admin\/moderation/);
});

test('welcome screen uses the shared brand hierarchy without decorative orbit art', async () => {
  const styles = await read('apps/frontend/app/welcome/welcome.module.css');
  assert.match(styles, /\.hero::after\{content:none\}/);
  assert.match(styles, /--brand-navy/);
  assert.match(styles, /\.benefit[^}]*box-shadow:var\(--k-shadow-sm\)/s);
});
