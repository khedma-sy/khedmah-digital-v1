import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const search = await readFile('apps/frontend/app/search/page.tsx', 'utf8');
const map = await readFile('apps/frontend/app/map/page.tsx', 'utf8');
const styles = await readFile('apps/frontend/app/discovery.module.css', 'utf8');

test('search uses the shared design system and real discovery APIs', () => {
  for (const primitive of ['PageShell', 'PageHeader', 'Surface', 'ActionButton', 'EmptyState', 'SkeletonGrid']) {
    assert.match(search, new RegExp(`\\b${primitive}\\b`));
  }
  assert.match(search, /api\.search\.query/);
  assert.match(search, /api\.businesses\.search/);
  assert.match(search, /api\.professionals\.search/);
  assert.doesNotMatch(search, /className="(?:page-shell|filter-bar|card|empty-state)"/);
  assert.doesNotMatch(search, /style=\{\{/);
});

test('map keeps functional Google discovery without legacy blue classes', () => {
  assert.match(map, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(map, /api\.search\.query/);
  assert.match(map, /navigator\.geolocation/);
  assert.match(map, /StatusMessage/);
  assert.doesNotMatch(map, /className="(?:marketplace-map|map-results|google-map|locate-button)/);
});

test('discovery surfaces use tokens and responsive layouts', () => {
  for (const token of ['--k-color-canvas', '--k-color-surface', '--k-color-text', '--k-color-primary', '--k-color-border']) {
    assert.match(styles, new RegExp(token));
  }
  assert.match(styles, /@media\(max-width:52rem\)/);
  assert.match(styles, /\.listView \.providerList[\s\S]*repeat\(auto-fit/);
  assert.match(styles, /grid-template-columns:repeat\(auto-fill/);
  assert.doesNotMatch(styles, /#06121a|#83ca3e|#0a202c/);
});
