import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Web map sanitizes its protected key and requests async Google Maps loading', async () => {
  const page = await read('apps/frontend/app/map/page.tsx');
  assert.match(page, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY\?\.trim\(\)/);
  assert.match(page, /loading=async/);
  assert.match(page, /callback=initKhedmahMap/);
  assert.match(page, /window\.initKhedmahMap = \(\) =>/);
  assert.match(page, /document\.head\.appendChild\(insertedScript\)/);
  assert.match(page, /data-map-status=\{mapStatus\}/);
});

test('Production deploy opens the live map in a browser and requires ready state', async () => {
  const workflow = await read('.github/workflows/production-operator.yml');
  assert.match(workflow, /GOOGLE_MAPS_BROWSER_API_KEY: \$\{\{ secrets\.GOOGLE_MAPS_BROWSER_API_KEY \}\}/);
  assert.match(workflow, /--headless/);
  assert.match(workflow, /--virtual-time-budget=25000/);
  assert.match(workflow, /data-map-status="ready"/);
});

test('Production deploy discovers the live frontend URL and permits both Cloud Run aliases', async () => {
  const build = await read('cloudbuild.production.yaml');
  const middleware = await read('apps/backend/src/middleware/csrf-origin.middleware.ts');
  assert.match(build, /FRONTEND_RUNTIME_URL=.*gcloud run services describe/);
  assert.match(build, /CORS_ORIGIN=\$\$ALLOWED_ORIGINS/);
  assert.match(middleware, /\.split\(','\)/);
  assert.match(middleware, /allowedOrigins\.has\(originHeader\)/);
});
