import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('canonical shell loads after design tokens', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const tokens = layout.indexOf("./design-tokens.css");
  const shell = layout.indexOf("./shell-system.css");
  assert.ok(tokens >= 0);
  assert.ok(shell > tokens);
});

test('global header remains owned by root layout and shell layer', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const shell = await read('apps/frontend/app/shell-system.css');
  assert.match(layout, /<header className="khedma-header">/);
  assert.match(shell, /\.khedma-header\{/);
  assert.match(shell, /position:sticky/);
  assert.match(shell, /--brand-green/);
});
