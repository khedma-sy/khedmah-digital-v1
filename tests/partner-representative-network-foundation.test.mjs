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

test('partner and representative foundation documentation exists and defines partner identity', async () => {
  const doc = await read('docs/architecture/PARTNER-REPRESENTATIVE-NETWORK-FOUNDATION.md');

  assert.match(doc, /# Partner & Representative Network Foundation/);
  assert.match(doc, /Khedmah Digital Partner/);
  assert.match(doc, /شريك خدمة ديجتل/);
  assert.match(doc, /Partner is not an employee/);
  assert.match(doc, /Partner is not a financial affiliate/);
  assert.match(doc, /Partner is not a marketplace seller/);
});

test('partner and representative foundation defines partner and representative types', async () => {
  const doc = await read('docs/architecture/PARTNER-REPRESENTATIVE-NETWORK-FOUNDATION.md');

  assert.match(doc, /Regional Partner/);
  assert.match(doc, /Damascus Partner/);
  assert.match(doc, /Business Partner/);
  assert.match(doc, /Industry partner/);
  assert.match(doc, /Digital Partner/);
  assert.match(doc, /Technology company/);
  assert.match(doc, /Community Partner/);
  assert.match(doc, /Sales Representative/);
  assert.match(doc, /Factory representative/);
  assert.match(doc, /Service Representative/);
  assert.match(doc, /Delivery Representative/);
  assert.match(doc, /Technical Representative/);
});

test('partner and representative foundation defines relationship and trust models', async () => {
  const doc = await read('docs/architecture/PARTNER-REPRESENTATIVE-NETWORK-FOUNDATION.md');

  assert.match(doc, /Organization \/ Provider\n↓\nPartner \/ Representative\n↓\nRegion \/ Coverage\n↓\nServices \/ Categories\n↓\nUsers/);
  assert.match(doc, /Partner type/);
  assert.match(doc, /Coverage area/);
  assert.match(doc, /Supported categories/);
  assert.match(doc, /Organization relationship/);
  assert.match(doc, /Trust status/);
  assert.match(doc, /Activity history/);
  assert.match(doc, /Factory\n↓\nRegional Representative\n↓\nLocal Businesses\n↓\nCustomers/);
  assert.match(doc, /Partner Activity\n↓\nContribution History\n↓\nTrust Level/);
});

test('partner and representative foundation preserves V1 boundaries and excludes financial features', async () => {
  const doc = await read('docs/architecture/PARTNER-REPRESENTATIVE-NETWORK-FOUNDATION.md');

  assert.match(doc, /documentation and architecture preparation only/i);
  assert.match(doc, /does not implement production features, APIs, database models, migrations, UI screens, partner dashboards, payment systems, commissions, affiliate systems, revenue sharing, marketplace, ordering systems, messaging\/chat, recruitment systems, automated assignment/i);
  assert.match(doc, /does not authorize or implement/i);
  assert.match(doc, /Commissions/);
  assert.match(doc, /Affiliate tracking/);
  assert.match(doc, /Payments/);
  assert.match(doc, /Financial rewards/);
  assert.match(doc, /Revenue sharing/);
  assert.match(doc, /Marketplace/);
  assert.match(doc, /Sales transactions/);
  assert.match(doc, /Ordering/);
  assert.match(doc, /Messaging/);
  assert.match(doc, /Recruitment/);
});

test('mission does not add forbidden partner runtime implementation files', async () => {
  const files = await collectFiles(repoPath('.'));
  const forbiddenRuntimeFiles = files
    .map((file) => file.replace(repoPath('.'), ''))
    .filter((file) => /(^|\/)(partner-dashboard|payment-systems|payments|commissions|affiliate|revenue-sharing|marketplace|ordering|orders|messaging|chat|recruitment|automated-assignment)(\/|\.|-)/i.test(file));

  assert.deepEqual(forbiddenRuntimeFiles, []);
});

test('RTL Arabic direction remains preserved for partner network readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
