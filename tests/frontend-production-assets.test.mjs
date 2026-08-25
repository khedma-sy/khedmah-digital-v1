import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('frontend runtime image includes public assets used by the approved brand', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile.frontend', import.meta.url), 'utf8');

  assert.match(dockerfile, /COPY --from=build[^\n]*\/workspace\/apps\/frontend\/public apps\/frontend\/public/);
});

test('homepage category cards use canonical backend categories and codes', async () => {
  const component = await readFile(new URL('../apps/frontend/app/components/featured-categories.tsx', import.meta.url), 'utf8');

  assert.match(component, /useCategories\(\)/);
  assert.match(component, /categoryCode=\$\{encodeURIComponent\(category\.code\)\}/);
  assert.match(component, /aria-busy="true"/);
});
