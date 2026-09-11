import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { verifyClassifiedsBackendSmoke } from '../scripts/deployment/verify-classifieds-backend-smoke.mjs';

const deployScript = readFileSync(new URL('../scripts/deployment/deploy-cloud-run-environment.sh', import.meta.url), 'utf8');
const baseUrl = 'https://khedmah-pr-166-backend-123456789.europe-west1.run.app';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeFetchFor(overrides = {}) {
  const calls = [];
  const responses = {
    '/api/v1/classifieds': jsonResponse(200, { ads: [] }),
    '/api/v1/classifieds/smoke-nonexistent-classified-ad': jsonResponse(404, { statusCode: 404 }),
    '/api/v1/classifieds/mine': jsonResponse(401, { statusCode: 401 }),
    '/api/v1/admin/classifieds/pending': jsonResponse(401, { statusCode: 401 }),
    ...overrides
  };
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, method: options?.method, redirect: options?.redirect });
    const response = responses[parsed.pathname];
    if (!response) throw new Error(`Unexpected smoke request: ${parsed.pathname}`);
    return response.clone();
  };
  return { calls, fetchImpl };
}

test('Classifieds backend smoke verifies public and unauthenticated boundaries', async () => {
  const { calls, fetchImpl } = fakeFetchFor();
  await verifyClassifiedsBackendSmoke(baseUrl, fetchImpl);
  assert.deepEqual(calls.map((call) => call.path), [
    '/api/v1/classifieds',
    '/api/v1/classifieds/smoke-nonexistent-classified-ad',
    '/api/v1/classifieds/mine',
    '/api/v1/admin/classifieds/pending'
  ]);
  assert.ok(calls.every((call) => call.method === 'GET' && call.redirect === 'manual'));
});

test('Classifieds backend smoke rejects public internal-field leakage', async () => {
  const { fetchImpl } = fakeFetchFor({
    '/api/v1/classifieds': jsonResponse(200, { ads: [{ id: 'a', ownerUserId: 'private' }] })
  });
  await assert.rejects(() => verifyClassifiedsBackendSmoke(baseUrl, fetchImpl), /leaked internal field: ownerUserId/);
});

test('Classifieds backend smoke rejects an unauthenticated owner boundary that returns success', async () => {
  const { fetchImpl } = fakeFetchFor({
    '/api/v1/classifieds/mine': jsonResponse(200, { ads: [] })
  });
  await assert.rejects(() => verifyClassifiedsBackendSmoke(baseUrl, fetchImpl), /expected HTTP 401, received 200/);
});

test('deploy runs Classifieds backend smoke after backend URL resolution and before frontend build when backend flag is enabled', () => {
  const backendUrl = deployScript.indexOf('backend_url="$(gcloud run services describe');
  const smokeGate = deployScript.indexOf("if [[ \"$CLASSIFIEDS_ENABLED\" == 'true' ]]");
  const smokeCall = deployScript.indexOf('verify-classifieds-backend-smoke.mjs');
  const frontendBuild = deployScript.indexOf('gcloud builds submit . --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --config "$config"');
  assert.ok(backendUrl >= 0);
  assert.ok(smokeGate > backendUrl);
  assert.ok(smokeCall > smokeGate);
  assert.ok(frontendBuild > smokeCall);
});
