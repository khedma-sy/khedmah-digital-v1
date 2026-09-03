import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

const appRoot = new URL('../apps/frontend/app/', import.meta.url);

async function collectPages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectPages(path));
    else if (entry.name === 'page.tsx') files.push(path);
  }
  return files;
}

test('every frontend page is audited against retired utility styling', async () => {
  const pages = await collectPages(appRoot.pathname);
  assert.ok(pages.length >= 30, `Expected the full route set, found ${pages.length}`);
  const retiredUtilities = /className="[^"]*(?:text-(?:red|blue|green|gray)-\d+|bg-(?:white|black|red|blue|green|gray)-?\d*|p-[468]|mx-auto|rounded-lg|shadow-xl)[^"]*"/;
  for (const page of pages) {
    const source = await readFile(page, 'utf8');
    assert.doesNotMatch(source, retiredUtilities, `Retired styling in ${relative(appRoot.pathname, page)}`);
  }
});

test('social login verifies the selected provider on both sides of the API', async () => {
  const client = await readFile(new URL('../apps/frontend/lib/firebase/auth.ts', import.meta.url), 'utf8');
  const login = await readFile(new URL('../apps/frontend/app/auth/login/page.tsx', import.meta.url), 'utf8');
  const register = await readFile(new URL('../apps/frontend/app/auth/register/page.tsx', import.meta.url), 'utf8');
  const api = await readFile(new URL('../apps/frontend/lib/identity-api.ts', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../apps/backend/src/identity/auth.controller.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../apps/backend/src/identity/google-auth.service.ts', import.meta.url), 'utf8');
  assert.match(client, /FacebookAuthProvider/);
  assert.match(client, /GoogleAuthProvider/);
  assert.match(client, /NEXT_PUBLIC_FACEBOOK_AUTH_ENABLED/);
  assert.match(login, /FACEBOOK_AUTH_ENABLED/);
  assert.match(login, /Facebook — قريبًا/);
  assert.match(register, /FACEBOOK_AUTH_ENABLED/);
  assert.match(register, /غير متاح حاليًا/);
  assert.match(register, /register-provider-unavailable/);
  assert.match(api, /auth\/facebook/);
  assert.match(controller, /@Post\("facebook"\)/);
  assert.match(service, /facebook\.com/);
  assert.match(service, /providerUserInfo/);
  assert.match(service, /WHERE provider = \$1 AND provider_subject = \$2/);
});
