import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('analytics backend exposes only the approved event recording endpoint', async () => {
  const controller = await read('apps/backend/src/analytics/analytics.controller.ts');

  assert.match(controller, /@Controller\('analytics\/events'\)/);
  assert.match(controller, /@Post\(\)/);
  assert.doesNotMatch(controller, /dashboard|report|admin|recommendation|ranking|advertising|profiling/i);
});

test('analytics validation allows only approved events and rejects private fields', async () => {
  const validation = await read('apps/backend/src/analytics/analytics.validation.ts');

  assert.match(validation, /business_view/);
  assert.match(validation, /search_action/);
  assert.match(validation, /contact_click/);
  assert.match(validation, /inquiry_submitted/);
  assert.match(validation, /FORBIDDEN_METADATA_KEYS/);
  assert.match(validation, /validateOccurredAt/);
  assert.doesNotMatch(validation, /dashboard|recommendations|ranking|advertising|behavioral targeting|user_profile/i);
});

test('analytics database SQL creates only analytics_events', async () => {
  const sql = await read('infra/database/004_analytics_foundation.sql');
  const tables = [...sql.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((match) => match[1]).sort();

  assert.deepEqual(tables, ['analytics_events']);
  assert.doesNotMatch(sql, /CREATE TABLE\s+(analytics_dashboards|recommendations|rankings|advertising|user_profiles|marketplace_analytics|messaging_analytics)/i);
});
