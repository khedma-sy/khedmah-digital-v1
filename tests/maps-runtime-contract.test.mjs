import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Web map sanitizes its protected key and requests async Google Maps loading', async () => {
  const page = await read('apps/frontend/app/map/page.tsx');
  assert.match(page, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY\?\.trim\(\)/);
  assert.match(page, /loading=async/);
  assert.match(page, /callback=initKhedmahMap/);
  assert.match(page, /const initialize = \(\) => \{/);
  assert.match(page, /window\.initKhedmahMap = initialize;/);
  assert.match(page, /if \(window\.initKhedmahMap === initialize\) window\.initKhedmahMap = previousInitializer;/);
  assert.match(page, /try \{ initializeMapRef\.current\(\); \}/);
  assert.match(page, /document\.head\.appendChild\(insertedScript\)/);
  assert.match(page, /data-map-status=\{mapStatus\}/);
});

test('Web map never offers a retry that can hang when the Maps key is absent', async () => {
  const page = await read('apps/frontend/app/map/page.tsx');
  assert.match(page, /mapStatus === 'error' && MAPS_KEY &&/);
  assert.match(page, /\{MAPS_KEY && <ActionButton type="button" onClick=\{retryMap\}>إعادة المحاولة<\/ActionButton>\}/);
});

test('new-account Production deploy opens the live map in a browser and requires ready state', async () => {
  const workflow = await read('.github/workflows/production-operator-new-account.yml');
  assert.match(workflow, /--headless/);
  assert.match(workflow, /--virtual-time-budget=25000/);
  assert.match(workflow, /data-map-status=\\"ready\\"|data-map-status="ready"/);
  assert.match(workflow, /MAP_STATUS=ready/);
});

test('new-account Production contract injects explicit API and CORS origins', async () => {
  const build = await read('cloudbuild.production-new-account.yaml');
  const middleware = await read('apps/backend/src/middleware/csrf-origin.middleware.ts');
  assert.match(build, /_NEXT_PUBLIC_API_URL: REQUIRED_NEXT_PUBLIC_API_URL/);
  assert.match(build, /_CORS_ORIGIN: REQUIRED_CORS_ORIGIN/);
  assert.match(build, /CORS_ORIGIN=\$\{_CORS_ORIGIN\}/);
  assert.doesNotMatch(build, /project-94512a0e-1a5e-4bdb-87f|774201339973/);
  assert.match(middleware, /\.split\(','\)/);
  assert.match(middleware, /allowedOrigins\.has\(originHeader\)/);
});
