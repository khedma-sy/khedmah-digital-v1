import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { inventory, parseTree, reviewablePath, writeInventory } from '../scripts/repository-inventory.mjs';

test('inventory accepts only the explicit source allowlist, never environment or credentials', () => {
  for (const path of ['apps/frontend/app/page.tsx', 'apps/frontend/components/contact-inquiry-form.tsx', 'apps/frontend/components/owner-workspace.module.css', 'ROADMAP-EXECUTION-2026-09-08.md', 'apps/backend/src/app.module.ts', 'apps/backend/tests/search.test.ts', 'docs/product/V1-SCOPE.md', '.github/workflows/node.js.yml', 'package.json']) assert.equal(reviewablePath(path), true, path);
  for (const path of ['.env', '.env.production', 'apps/frontend/.env.local', 'apps/frontend/lib/credentials/key.ts', 'secrets.json', 'apps/backend/src/service-account.json', 'apps/frontend/app/.hidden.ts', 'apps/frontend/app/node_modules/a.ts', 'docs/private.pem', 'docs/image.png', 'report.zip', 'apps/frontend/components/.env.local', 'apps/frontend/components/secrets/key.ts', 'apps/frontend/components/portrait.png']) assert.equal(reviewablePath(path), false, path);
});

test('NUL-delimited git inventory preserves spaces and identifies symlinks without following them', () => {
  const records = parseTree('100644 blob a\tfile with spaces.md\0' + '120000 blob b\tsecret-link.ts\0');
  assert.equal(records[0].path, 'file with spaces.md');
  assert.equal(records[1].mode, '120000');
});

test('inventory is commit-pinned, read-only, route-aware and excludes secrets from its optional bundle', async () => {
  const base = await mkdtemp(join(tmpdir(), 'khedmah-inventory-'));
  const root = join(base, 'repo'); const out = join(base, 'evidence');
  await mkdir(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('init'); git('config', 'user.name', 'Inventory Test'); git('config', 'user.email', 'test@example.invalid');
    const put = async (path, text) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), text); };
    await put('apps/frontend/app/layout.tsx', "import './globals.css';\nimport './shell.css';\n");
    await put('apps/frontend/app/page.tsx', 'export default function Home() { return <h1>خدمة</h1>; }');
    await put('apps/frontend/app/(legacy)/old/page.tsx', "import { redirect } from 'next/navigation';\nexport default function Page() { redirect('/'); }");
    await put('apps/frontend/components/contact-inquiry-form.tsx', 'export const InquiryForm = () => null;');
    await put('apps/frontend/components/owner-workspace.module.css', '.workspace { display: grid; }');
    await put('ROADMAP-EXECUTION-2026-09-08.md', '# Approved execution reference');
    await put('apps/frontend/app/classifieds/page.tsx', "export { default } from '../store/page';\n");
    await put('.env.production', 'INVENTORY_TEST_SECRET=never-export\n');
    await put('docs/copy-a.md', 'reference'); await put('docs/copy-b.md', 'reference');
    git('add', '.'); git('commit', '-m', 'fixture');
    const expected = git('rev-parse', 'HEAD').trim();
    const before = git('status', '--porcelain');
    const data = await writeInventory({ cwd: root, out, bundle: true });
    assert.equal(data.commit, expected); assert.equal(data.routeCount, 3);
    assert.equal(data.routes.find((r) => r.route === '/classifieds').reexport, '../store/page');
    assert.equal(data.routes.find((r) => r.route === '/classifieds').redirect, null);
    assert.equal(data.routes.find((r) => r.route === '/').reexport, null);
    assert.match(await readFile(join(out, 'repository-inventory.md'), 'utf8'), /shared page re-export: `\.\.\/store\/page`/);
    assert.deepEqual(data.cssLoadOrder, ['./globals.css', './shell.css']);
    assert.equal(data.routes.find((r) => r.route === '/old').redirect, '/');
    assert.ok(data.duplicateContentGroups.some((g) => g.paths.includes('docs/copy-a.md') && g.paths.includes('docs/copy-b.md')));
    const tar = await readFile(join(out, 'review-source.tar'));
    assert.ok(tar.includes(Buffer.from('apps/frontend/components/contact-inquiry-form.tsx')));
    assert.ok(tar.includes(Buffer.from('.workspace { display: grid; }')));
    assert.ok(tar.includes(Buffer.from('# Approved execution reference')));
    assert.ok(!tar.includes(Buffer.from('never-export')));
    assert.ok(!tar.includes(Buffer.from('.env.production')));
    assert.equal(git('status', '--porcelain'), before);
    await put('apps/frontend/app/page.tsx', '<h1>uncommitted change</h1>');
    assert.deepEqual(inventory(root).routes.find((r) => r.route === '/').titles, ['خدمة']);
    await assert.rejects(writeInventory({ cwd: root, out: join(root, 'reports') }), /outside the checkout/);
    await assert.rejects(writeInventory({ cwd: root }), /explicit output/);
  } finally { await rm(base, { recursive: true, force: true }); }
});


test('output cannot enter the checkout through a parent directory symlink', async () => {
  const base = await mkdtemp(join(tmpdir(), 'khedmah-inventory-path-'));
  const root = join(base, 'repo');
  await mkdir(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('init'); git('config', 'user.name', 'Inventory Test'); git('config', 'user.email', 'test@example.invalid');
    await writeFile(join(root, 'README.md'), '# Keep original');
    git('add', '.'); git('commit', '-m', 'fixture');
    await symlink(root, join(base, 'alias'), 'dir');
    const before = git('status', '--porcelain');
    await assert.rejects(writeInventory({ cwd: root, out: join(base, 'alias', 'generated') }), /outside the checkout/);
    assert.equal(git('status', '--porcelain'), before);
    await assert.rejects(readFile(join(root, 'generated', 'repository-inventory.json')), { code: 'ENOENT' });
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('pre-existing evidence file symlinks cannot overwrite a tracked source file', async () => {
  const base = await mkdtemp(join(tmpdir(), 'khedmah-inventory-output-'));
  const root = join(base, 'repo'); const out = join(base, 'evidence');
  await mkdir(root); await mkdir(out);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('init'); git('config', 'user.name', 'Inventory Test'); git('config', 'user.email', 'test@example.invalid');
    await writeFile(join(root, 'README.md'), '# Keep original');
    git('add', '.'); git('commit', '-m', 'fixture');
    await symlink(join(root, 'README.md'), join(out, 'repository-inventory.json'));
    const before = git('status', '--porcelain');
    await assert.rejects(writeInventory({ cwd: root, out }), /symbolic link/);
    assert.equal(await readFile(join(root, 'README.md'), 'utf8'), '# Keep original');
    assert.equal(git('status', '--porcelain'), before);
  } finally { await rm(base, { recursive: true, force: true }); }
});
