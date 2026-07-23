import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const repoPath = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const collectFiles = async (dir, results = []) => {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.next') {
      continue;
    }

    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path, results);
    } else {
      results.push(path);
    }
  }

  return results;
};

test('public discovery blueprint exists and defines the official discovery model', async () => {
  const doc = await read('docs/architecture/PUBLIC-DISCOVERY-EXPERIENCE-BLUEPRINT.md');

  assert.match(doc, /# Public Discovery Experience Blueprint/);
  assert.match(doc, /Service discovery/);
  assert.match(doc, /Business discovery/);
  assert.match(doc, /Professional discovery/);
  assert.match(doc, /Location-based discovery/);
  assert.match(doc, /Category-based discovery/);
  assert.match(doc, /User Need\n↓\nSearch \/ Browse\n↓\nCategory\n↓\nSubcategory\n↓\nService\n↓\nProvider \/ Business Profile\n↓\nLocation\n↓\nTrust Information/);
  assert.match(doc, /Country\n↓\nCity\n↓\nArea\n↓\nService Coverage/);
});

test('public discovery blueprint preserves V1 boundaries and forbidden feature exclusions', async () => {
  const doc = await read('docs/architecture/PUBLIC-DISCOVERY-EXPERIENCE-BLUEPRINT.md');

  assert.match(doc, /documentation and architecture preparation only/i);
  assert.match(doc, /does not implement production features, APIs, database models, UI screens, marketplace, payments, ordering, messaging\/chat, commissions, advertising, ranking, or AI recommendations/i);
  assert.match(doc, /does not authorize or implement/i);
  assert.match(doc, /Marketplace/);
  assert.match(doc, /Payments/);
  assert.match(doc, /Ordering/);
  assert.match(doc, /Messaging\/chat/);
  assert.match(doc, /Commissions/);
  assert.match(doc, /Advertising/);
  assert.match(doc, /Ranking/);
  assert.match(doc, /AI recommendations/);
});

test('mission does not add forbidden runtime discovery implementation files', async () => {
  const files = await collectFiles(repoPath('.'));
  const forbiddenRuntimeFiles = files
    .map((file) => file.replace(repoPath('.').pathname, ''))
    .filter((file) => /(^|\/)(marketplace|payments|orders|ordering|commissions|advertising|ranking|recommendations|chat|messaging)(\/|\.|-)/i.test(file));

  assert.deepEqual(forbiddenRuntimeFiles, []);
});

test('RTL Arabic direction remains preserved for public discovery readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
