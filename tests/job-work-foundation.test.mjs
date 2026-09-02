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

test('Job Work foundation documentation exists and defines the Job Work model', async () => {
  const doc = await read('docs/architecture/JOB-WORK-FOUNDATION.md');

  assert.match(doc, /# Job Work Foundation/);
  assert.match(doc, /operational layer that transforms a service discovery into a future execution workflow/i);
  assert.match(doc, /User Need\n↓\nService\n↓\nProvider\n↓\nJob Type\n↓\nExecution Workflow\n↓\nCompletion\n↓\nTrust History/);
});

test('Job Work foundation defines service execution types and lifecycle', async () => {
  const doc = await read('docs/architecture/JOB-WORK-FOUNDATION.md');

  assert.match(doc, /Instant Service/);
  assert.match(doc, /Cleaning/);
  assert.match(doc, /Electrical repair/);
  assert.match(doc, /Appointment Service/);
  assert.match(doc, /Doctor/);
  assert.match(doc, /Project Service/);
  assert.match(doc, /Construction/);
  assert.match(doc, /Supply Service/);
  assert.match(doc, /Factory supply/);
  assert.match(doc, /Transport Service/);
  assert.match(doc, /Taxi/);
  assert.match(doc, /Created\n↓\nAssigned\n↓\nAccepted\n↓\nOn The Way\n↓\nArrived\n↓\nIn Progress\n↓\nCompleted\n↓\nRated/);
});

test('Job Work foundation documents worker foundation and trust compatibility', async () => {
  const doc = await read('docs/architecture/JOB-WORK-FOUNDATION.md');

  assert.match(doc, /Delivery representative/);
  assert.match(doc, /Sales representative/);
  assert.match(doc, /Technical worker/);
  assert.match(doc, /Driver/);
  assert.match(doc, /Freelancer worker/);
  assert.match(doc, /Service types/);
  assert.match(doc, /Coverage areas/);
  assert.match(doc, /Availability status/);
  assert.match(doc, /Completed jobs history/);
  assert.match(doc, /Performance indicators/);
  assert.match(doc, /Job completion\n↓\nPerformance history\n↓\nTrust level/);
});

test('Job Work foundation preserves V1 boundaries and excludes forbidden features', async () => {
  const doc = await read('docs/architecture/JOB-WORK-FOUNDATION.md');

  assert.match(doc, /documentation and architecture preparation only/i);
  assert.match(doc, /does not implement production features, APIs, database models, migrations, UI screens, mobile workflows, a task assignment engine, dispatch system, payments, wallets, commissions, marketplace, ordering, delivery marketplace, messaging\/chat, AI matching, automation/i);
  assert.match(doc, /does not authorize or implement/i);
  assert.match(doc, /Marketplace/);
  assert.match(doc, /Ordering/);
  assert.match(doc, /Payments/);
  assert.match(doc, /Commissions/);
  assert.match(doc, /Wallets/);
  assert.match(doc, /Delivery marketplace/);
  assert.match(doc, /Messaging/);
  assert.match(doc, /Chat/);
  assert.match(doc, /AI matching/);
  assert.match(doc, /Automatic assignment/);
});

test('mission does not add forbidden Job Work runtime implementation files', async () => {
  const files = await collectFiles(repoPath('.'));
  const forbiddenRuntimeFiles = files
    .map((file) => file.replace(repoPath('.'), ''))
    .filter((file) => /(^|\/)(task-assignment|dispatch|payments|wallets|commissions|marketplace|delivery-marketplace|messaging|chat|ai-matching|automation)(\/|\.|-)/i.test(file));

  assert.deepEqual(forbiddenRuntimeFiles, []);
});

test('RTL Arabic direction remains preserved for Job Work readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
