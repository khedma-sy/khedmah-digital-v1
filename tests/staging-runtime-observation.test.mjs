import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { observeStagingRuntime } from '../scripts/deployment/observe-staging-runtime.mjs';

const workflow = readFileSync(new URL('../.github/workflows/staging-deployment.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../scripts/deployment/observe-staging-runtime.mjs', import.meta.url), 'utf8');

test('Staging runtime observation records repeated healthy samples without recording service URLs', async () => {
  const requested = [];
  const result = await observeStagingRuntime({
    backendUrl: 'https://backend-fixture.run.app',
    frontendUrl: 'https://frontend-fixture.run.app',
    sampleCount: 3,
    intervalMs: 0,
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      requested.push(String(url));
      return { ok: true, status: 200 };
    },
    sleepImpl: async () => {},
    nowImpl: () => new Date('2026-09-10T20:00:00.000Z')
  });
  assert.equal(result.passed, true);
  assert.equal(result.completedSamples, 3);
  assert.equal(result.urlsRecorded, false);
  assert.equal(result.samples.length, 3);
  assert.equal(requested.length, 6);
  assert.ok(requested.every((url) => url.includes('.run.app/')));
  assert.equal(JSON.stringify(result).includes('backend-fixture.run.app'), false);
  assert.equal(JSON.stringify(result).includes('frontend-fixture.run.app'), false);
});

test('Staging runtime observation fails closed on the first unhealthy sample', async () => {
  let calls = 0;
  const result = await observeStagingRuntime({
    backendUrl: 'https://backend-fixture.run.app',
    frontendUrl: 'https://frontend-fixture.run.app',
    sampleCount: 6,
    intervalMs: 0,
    timeoutMs: 1000,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? { ok: false, status: 503 } : { ok: true, status: 200 };
    },
    sleepImpl: async () => {},
    nowImpl: () => new Date('2026-09-10T20:00:00.000Z')
  });
  assert.equal(result.passed, false);
  assert.equal(result.completedSamples, 1);
  assert.equal(result.samples[0].backend.status, 503);
  assert.equal(calls, 2, 'both endpoints in the failed sample are recorded, but later samples must not run');
});

test('Staging observation is isolated from Production and is uploaded as release evidence', () => {
  assert.match(script, /DEPLOYMENT_ENVIRONMENT !== 'staging'/);
  assert.match(script, /project === productionProject/);
  assert.match(script, /HTTPS Cloud Run service URL/);
  assert.match(script, /STAGING_HEALTH_SAMPLES, 6, 3, 12/);
  assert.doesNotMatch(script, /\b(?:DELETE|UPDATE|INSERT|DROP)\b/);

  const deployJob = workflow.slice(workflow.indexOf('  deploy-staging:'), workflow.indexOf('  classifieds-staging-acceptance:'));
  assert.match(deployJob, /actions\/setup-node@v4[\s\S]*node-version: 20/);
  assert.match(deployJob, /name: Observe Staging runtime/);
  assert.match(deployJob, /BACKEND_URL: \$\{\{ steps\.deploy\.outputs\.backend_url \}\}/);
  assert.match(deployJob, /FRONTEND_URL: \$\{\{ steps\.deploy\.outputs\.frontend_url \}\}/);
  assert.match(deployJob, /run: node scripts\/deployment\/observe-staging-runtime\.mjs/);
  assert.match(deployJob, /name: staging-runtime-observation/);
  assert.match(deployJob, /if: always\(\)/);
});
