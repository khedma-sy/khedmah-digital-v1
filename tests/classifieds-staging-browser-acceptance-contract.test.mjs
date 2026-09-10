import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/staging-deployment.yml');
const acceptance = read('scripts/check-classifieds-preview-acceptance.mjs');

test('Staging browser acceptance runs only after the tracked frontend-on state', () => {
  assert.match(workflow, /classifieds-staging-acceptance:/);
  assert.match(workflow, /if: needs\.deploy-staging\.outputs\.classifieds_frontend_enabled == 'true'/);
  assert.match(workflow, /classifieds_frontend_enabled: \$\{\{ steps\.classifieds-stage\.outputs\.frontend_enabled \}\}/);
  assert.match(workflow, /EVIDENCE_DIR: staging-evidence/);
});

test('Staging browser acceptance is bound to the deployed Staging frontend and backend outputs', () => {
  assert.match(workflow, /AFTER_URL: \$\{\{ needs\.deploy-staging\.outputs\.frontend_url \}\}/);
  assert.match(workflow, /BACKEND_URL: \$\{\{ needs\.deploy-staging\.outputs\.backend_url \}\}/);
  assert.match(workflow, /run: node scripts\/check-classifieds-preview-acceptance\.mjs/);
  assert.doesNotMatch(workflow, /khedmah\.uk|PRODUCTION_FRONTEND_URL|PRODUCTION_BACKEND_URL/);
});

test('shared Classifieds browser acceptance remains anonymous and read-only', () => {
  assert.match(acceptance, /scope: 'Read-only anonymous acceptance/);
  assert.match(acceptance, /fetch\(new URL\('\/api\/v1\/classifieds', backendOrigin\)/);
  assert.match(acceptance, /response\.request\(\)\.method\(\) === 'GET'/);
  assert.doesNotMatch(acceptance, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
  assert.doesNotMatch(acceptance, /page\.click|\.click\(\)/);
});

test('Staging acceptance checks both direct backend and same-origin proxied Classifieds envelopes', () => {
  assert.match(acceptance, /DIRECT_BACKEND_CLASSIFIEDS_NOT_200/);
  assert.match(acceptance, /CLASSIFIEDS_PROXY_API_NOT_200/);
  assert.match(acceptance, /isAdsEnvelope\(envelope\)/);
  assert.match(acceptance, /url\.origin === frontendOrigin && url\.pathname === '\/api\/v1\/classifieds'/);
});
