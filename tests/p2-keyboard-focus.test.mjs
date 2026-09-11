import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const layout = await readFile(new URL('../apps/frontend/app/layout.tsx', import.meta.url), 'utf8');
const shell = await readFile(new URL('../apps/frontend/app/shell-system.css', import.meta.url), 'utf8');
const tokens = await readFile(new URL('../apps/frontend/app/design-tokens.css', import.meta.url), 'utf8');

test('skip navigation remains visible above the sticky application header', () => {
  assert.match(layout, /className="skip-link"/);
  assert.match(layout, /href="#foundation-content"/);
  assert.match(shell, /\.khedma-header\{[\s\S]*?z-index:120/);
  assert.match(shell, /\.skip-link\{z-index:300\}/);
});

test('header keyboard focus uses the approved high-contrast umbrella palette', () => {
  assert.match(shell, /\.khedma-header>a:focus-visible/);
  assert.match(shell, /\.nav-session a:focus-visible/);
  assert.match(shell, /\.nav-session button:focus-visible/);
  assert.match(shell, /outline:3px solid var\(--k-color-primary\)/);
  assert.match(shell, /box-shadow:0 0 0 1px var\(--k-color-accent\)/);
  assert.match(tokens, /--k-color-primary:\s*#07427c/);
  assert.match(tokens, /--k-color-accent:\s*#fd9603/);
});
