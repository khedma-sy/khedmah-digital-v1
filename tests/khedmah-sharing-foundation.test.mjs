import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('Khedmah sharing foundation documentation exists and preserves sharing identity', async () => {
  const doc = await read('docs/architecture/KHEDMAH-SHARING-FOUNDATION.md');

  assert.match(doc, /# Khedmah Digital Sharing Foundation/);
  assert.match(doc, /branded sharing layer/i);
  assert.match(doc, /☂️ أنا مع خدمة 💙/);
  assert.match(doc, /Khedmah umbrella identity/);
  assert.match(doc, /`أنا مع خدمة` slogan/);
  assert.match(doc, /Content\n↓\nShare Card\n↓\nExternal User\n↓\nKhedmah Digital Discovery/);
});

test('Khedmah sharing foundation documents supported future content types', async () => {
  const doc = await read('docs/architecture/KHEDMAH-SHARING-FOUNDATION.md');

  assert.match(doc, /Professional Knowledge/);
  assert.match(doc, /Doctor articles/);
  assert.match(doc, /Dentist knowledge/);
  assert.match(doc, /Engineer articles/);
  assert.match(doc, /Lawyer awareness content/);
  assert.match(doc, /Business Profiles/);
  assert.match(doc, /Restaurants/);
  assert.match(doc, /Factories/);
  assert.match(doc, /Suppliers/);
  assert.match(doc, /Services/);
  assert.match(doc, /Home services/);
  assert.match(doc, /Local Discoveries/);
  assert.match(doc, /New business in area/);
});

test('Khedmah sharing foundation preserves V1 boundaries and excludes social features', async () => {
  const doc = await read('docs/architecture/KHEDMAH-SHARING-FOUNDATION.md');

  assert.match(doc, /documentation and architecture preparation only/i);
  assert.match(doc, /does not implement production features, APIs, database models, migrations, UI screens, social network features, followers, likes, comments, messaging\/chat, advertising, paid promotion, ranking, marketplace, affiliate systems, commissions, AI recommendations/i);
  assert.match(doc, /does not authorize or implement/i);
  assert.match(doc, /Social feed/);
  assert.match(doc, /Followers/);
  assert.match(doc, /Likes/);
  assert.match(doc, /Comments/);
  assert.match(doc, /Chat/);
  assert.match(doc, /Advertising/);
  assert.match(doc, /Ranking/);
  assert.match(doc, /Paid visibility/);
});

test('mission does not add forbidden sharing runtime implementation files', async () => {
  const files = await collectFiles(repoPath('.'));
  const forbiddenRuntimeFiles = files
    .map((file) => file.replace(repoPath('.'), ''))
    .filter((file) => /(^|\/)(social-feed|followers|likes|comments|messaging|chat|advertising|paid-promotion|ranking|marketplace|affiliate|commissions|ai)(\/|\.|-)/i.test(file));

  assert.deepEqual(forbiddenRuntimeFiles, []);
});

test('RTL Arabic direction remains preserved for sharing readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
