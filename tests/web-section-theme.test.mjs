import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('web loads canonical section theme layer after design tokens', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const tokensIndex = layout.indexOf("./design-tokens.css");
  const themesIndex = layout.indexOf("./section-themes.css");
  assert.ok(tokensIndex >= 0);
  assert.ok(themesIndex > tokensIndex);
});

test('web brand accents match the approved Khedmah navy green orange system', async () => {
  const themes = await read('apps/frontend/app/section-themes.css');
  assert.match(themes, /--brand-navy:\s*#07427c/i);
  assert.match(themes, /--brand-green:\s*#81be49/i);
  assert.match(themes, /--brand-orange:\s*#fd9603/i);
});

test('categories use green without mutating the global functional primary color', async () => {
  const themes = await read('apps/frontend/app/section-themes.css');
  const tokens = await read('apps/frontend/app/design-tokens.css');
  assert.match(themes, /\.catalog-experience\s*\{[^}]*--section-accent:\s*var\(--brand-green\)/s);
  assert.match(themes, /\.catalog-experience \.catalog-category-icon\s*\{[^}]*background:\s*var\(--section-accent\)/s);
  assert.match(tokens, /--k-color-primary:\s*#07427c/i);
});

test('mobility and commerce keep independent visual accents', async () => {
  const mobility = await read('apps/frontend/app/mobility/mobility.module.css');
  const store = await read('apps/frontend/app/store/store.module.css');
  assert.match(mobility, /--mobility-accent:\s*var\(--brand-navy,#07427c\)/i);
  assert.match(store, /--store-accent:\s*var\(--brand-orange,#fd9603\)/i);
  assert.match(store, /ui-action-primary/i);
  assert.match(mobility, /@media\(max-width:42rem\)/i);
  assert.match(store, /prefers-reduced-motion:reduce/i);
});

test('search and nearby share the navy discovery hierarchy without changing their product logic', async () => {
  const discovery = await read('apps/frontend/app/discovery.module.css');
  const search = await read('apps/frontend/app/search/page.tsx');
  const map = await read('apps/frontend/app/map/page.tsx');
  assert.match(discovery, /--discovery-accent:\s*var\(--brand-navy,#07427c\)/i);
  assert.match(discovery, /2026-09 visual convergence/i);
  assert.match(search, /api\.search\.query|api\.services\.search/);
  assert.match(map, /google\.maps\.Map/);
  assert.match(map, /setActiveView\('list'\)/);
});
