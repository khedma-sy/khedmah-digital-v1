import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('every web route receives the approved shared brand system', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  assert.match(layout, /brand-system\.css/);
  assert.match(layout, /<BrandMark compact/);
});

test('identity journeys do not render the retired Syria silhouette', async () => {
  const visual = await read('apps/frontend/app/auth/identity-visual.tsx');
  assert.doesNotMatch(visual, /syria-silhouette|digital-umbrella/);
  assert.match(visual, /BrandMark/);
});

test('approved account reference is implemented as functional UI', async () => {
  const login = await read('apps/frontend/app/auth/login/page.tsx');
  const register = await read('apps/frontend/app/auth/register/page.tsx');
  const styles = await read('apps/frontend/app/auth-experience.css');
  assert.match(login, /auth-tabs/);
  assert.match(login, /auth-options/);
  assert.match(login, /signInWithGoogle/);
  assert.match(login, /signInWithFacebook/);
  assert.match(register, /auth-tabs/);
  assert.match(styles, /auth-experience::before/);
  assert.match(styles, /body:has\(\.auth-experience\) \.khedma-header/);
});

test('Android uses the approved navy green orange and warm surface tokens', async () => {
  const colors = await read('apps/android/app/src/main/res/values/colors.xml');
  for (const token of ['khedma_navy', 'khedma_green', 'khedma_orange', 'khedma_warm_background']) {
    assert.match(colors, new RegExp(`name="${token}"`));
  }
});

test('production runtime includes the public brand assets', async () => {
  const dockerfile = await read('Dockerfile.frontend');
  assert.match(dockerfile, /COPY --from=build .*apps\/frontend\/public apps\/frontend\/public/);
});
