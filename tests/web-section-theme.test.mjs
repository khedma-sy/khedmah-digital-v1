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
  assert.match(themes, /--brand-navy:\s*#173247/i);
  assert.match(themes, /--brand-green:\s*#16875f/i);
  assert.match(themes, /--brand-orange:\s*#e97835/i);
});

test('categories use green without mutating the global functional primary color', async () => {
  const themes = await read('apps/frontend/app/section-themes.css');
  const tokens = await read('apps/frontend/app/design-tokens.css');
  assert.match(themes, /\.catalog-experience\s*\{[^}]*--section-accent:\s*var\(--brand-green\)/s);
  assert.match(themes, /\.catalog-experience \.catalog-category-icon\s*\{[^}]*background:\s*var\(--section-accent\)/s);
  assert.match(tokens, /--k-color-primary:\s*#07427c/i);
});
