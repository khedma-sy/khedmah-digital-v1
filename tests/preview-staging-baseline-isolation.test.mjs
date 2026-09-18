import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/preview-deployment.yml', import.meta.url), 'utf8');
const block = workflow.split('  resolve-staging-baseline:\n')[1]?.split('\n  review-evidence:')[0] ?? '';

test('Preview resolves Staging baseline without Staging credentials', () => {
  assert.match(block, /environment: preview/);
  assert.match(block, /STAGING_FRONTEND_URL: \$\{\{ vars\.STAGING_FRONTEND_URL \}\}/);
  assert.match(block, /curl --fail/);
  assert.doesNotMatch(block, /google-github-actions\/auth/);
  assert.doesNotMatch(block, /GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT/);
  assert.doesNotMatch(block, /environment: staging/);
});

test('Preview rejects missing, local, or non-HTTPS Staging baselines', () => {
  assert.match(block, /STAGING_FRONTEND_URL must be configured after a healthy Staging deployment/);
  assert.match(block, /STAGING_FRONTEND_URL must use HTTPS/);
  assert.match(block, /localhost/);
  assert.match(block, /127\.0\.0\.1/);
});
