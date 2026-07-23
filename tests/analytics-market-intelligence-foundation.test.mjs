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

test('analytics and market intelligence foundation documentation exists and defines analytics vision', async () => {
  const doc = await read('docs/architecture/ANALYTICS-MARKET-INTELLIGENCE-FOUNDATION.md');

  assert.match(doc, /# Analytics & Market Intelligence Foundation/);
  assert.match(doc, /decision-support foundation/i);
  assert.match(doc, /Improve user experience/);
  assert.match(doc, /Understand service demand/);
  assert.match(doc, /Identify growth opportunities/);
  assert.match(doc, /Support expansion decisions/);
  assert.match(doc, /Platform Activity\n↓\nPrivacy-Aware Aggregation\n↓\nService Demand Insight\n↓\nGeographic Opportunity\n↓\nProvider Network Growth\n↓\nExpansion Decision Support/);
});

test('analytics foundation documents usage, search, service demand, geographic, and provider intelligence', async () => {
  const doc = await read('docs/architecture/ANALYTICS-MARKET-INTELLIGENCE-FOUNDATION.md');

  assert.match(doc, /Search activity/);
  assert.match(doc, /Service discovery activity/);
  assert.match(doc, /Business profile views/);
  assert.match(doc, /Most searched services/);
  assert.match(doc, /Unavailable service searches/);
  assert.match(doc, /High demand: Computer maintenance/);
  assert.match(doc, /Service demand/);
  assert.match(doc, /Provider availability/);
  assert.match(doc, /Food sector/);
  assert.match(doc, /Technology sector/);
  assert.match(doc, /Country\n↓\nCity\n↓\nArea\n↓\nService Coverage/);
  assert.match(doc, /Provider density/);
  assert.match(doc, /Doctors/);
  assert.match(doc, /Restaurants/);
  assert.match(doc, /Factories/);
  assert.match(doc, /Representatives/);
});

test('analytics foundation documents sharing, Job Work, investor intelligence, and privacy boundaries', async () => {
  const doc = await read('docs/architecture/ANALYTICS-MARKET-INTELLIGENCE-FOUNDATION.md');

  assert.match(doc, /☂️ أنا مع خدمة 💙/);
  assert.match(doc, /Shared content types/);
  assert.match(doc, /Professional knowledge engagement/);
  assert.match(doc, /This foundation does not implement social analytics/);
  assert.match(doc, /Completed jobs/);
  assert.match(doc, /Worker performance indicators/);
  assert.match(doc, /This foundation does not implement job analytics/);
  assert.match(doc, /Platform Growth Metrics/);
  assert.match(doc, /Users/);
  assert.match(doc, /Businesses/);
  assert.match(doc, /Market Intelligence Metrics/);
  assert.match(doc, /No private user data exposure/);
  assert.match(doc, /No personal tracking system/);
  assert.match(doc, /No data selling model/);
});

test('analytics foundation preserves V1 boundaries and excludes forbidden analytics features', async () => {
  const doc = await read('docs/architecture/ANALYTICS-MARKET-INTELLIGENCE-FOUNDATION.md');

  assert.match(doc, /documentation and architecture preparation only/i);
  assert.match(doc, /does not implement production features, APIs, database models, migrations, UI dashboards, analytics pipelines, tracking systems, data collection infrastructure, recommendation engines, AI systems, advertising systems, user profiling systems, payment analytics, marketplace analytics/i);
  assert.match(doc, /does not authorize or implement/i);
  assert.match(doc, /AI recommendations/);
  assert.match(doc, /Advertising/);
  assert.match(doc, /Ranking systems/);
  assert.match(doc, /Paid visibility/);
  assert.match(doc, /Marketplace analytics/);
  assert.match(doc, /User surveillance/);
  assert.match(doc, /Data monetization/);
  assert.match(doc, /Automated decisions/);
});

test('mission does not add forbidden analytics runtime implementation files', async () => {
  const files = await collectFiles(repoPath('.'));
  const forbiddenRuntimeFiles = files
    .map((file) => file.replace(repoPath('.'), ''))
    .filter((file) => /(^|\/)(analytics-pipelines|tracking-systems|data-collection-infrastructure|recommendation-engines|ai-systems|advertising-systems|user-profiling-systems|payment-analytics|marketplace-analytics|investor-dashboard|ui-dashboard)(\/|\.|-)/i.test(file));

  assert.deepEqual(forbiddenRuntimeFiles, []);
});

test('RTL Arabic direction remains preserved for analytics readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
