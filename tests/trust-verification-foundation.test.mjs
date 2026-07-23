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

test('trust and verification foundation documentation exists and defines the trust model', async () => {
  const doc = await read('docs/architecture/TRUST-VERIFICATION-FOUNDATION.md');

  assert.match(doc, /# Trust & Verification Foundation/);
  assert.match(doc, /User\n↓\nProfile Completeness\n↓\nVerification Status\n↓\nTrust Level/);
  assert.match(doc, /Basic Profile/);
  assert.match(doc, /Verified Business/);
  assert.match(doc, /Verified Professional/);
  assert.match(doc, /Verified Partner/);
  assert.match(doc, /Verified Organization/);
  assert.match(doc, /identity verification readiness/i);
  assert.match(doc, /business verification readiness/i);
  assert.match(doc, /professional verification readiness/i);
  assert.match(doc, /partner verification readiness/i);
});

test('trust and verification foundation preserves V1 boundaries', async () => {
  const doc = await read('docs/architecture/TRUST-VERIFICATION-FOUNDATION.md');

  assert.match(doc, /documentation and architecture only/i);
  assert.match(doc, /does not implement verification workflows, payments, subscriptions, paid badges, ranking, advertising, marketplace, messaging, AI/i);
  assert.match(doc, /does not authorize or implement/i);
  assert.match(doc, /Verification workflows/);
  assert.match(doc, /Payments/);
  assert.match(doc, /Subscriptions/);
  assert.match(doc, /Paid badges/);
  assert.match(doc, /Ranking/);
  assert.match(doc, /Advertising/);
  assert.match(doc, /Marketplace/);
  assert.match(doc, /Messaging/);
  assert.match(doc, /AI/);
});

test('mission does not add forbidden trust runtime implementation files', async () => {
  const files = await collectFiles(repoPath('.'));
  const forbiddenRuntimeFiles = files
    .map((file) => file.replace(repoPath('.'), ''))
    .filter((file) => /(^|\/)(verification-workflows|payments|subscriptions|paid-badges|ranking|advertising|marketplace|messaging|chat|ai)(\/|\.|-)/i.test(file));

  assert.deepEqual(forbiddenRuntimeFiles, []);
});

test('RTL Arabic direction remains preserved for trust display readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
