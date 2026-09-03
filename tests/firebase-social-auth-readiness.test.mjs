import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production readiness requires Google and gates Facebook behind the production feature flag', async () => {
  const [validator, prerequisites, workflow, previewWorkflow, stagingWorkflow, deployment] = await Promise.all([
    read('scripts/validate-firebase-social-auth-readiness.sh'),
    read('scripts/validate-production-deployment-readiness.sh'),
    read('.github/workflows/production-operator.yml'),
    read('.github/workflows/preview-deployment.yml'),
    read('.github/workflows/staging-deployment.yml'),
    read('scripts/deployment/deploy-cloud-run-environment.sh')
  ]);

  assert.match(prerequisites, /identitytoolkit\.googleapis\.com/);
  assert.match(validator, /\.authorizedDomains/);
  assert.match(validator, /required_providers=\(google\.com\)/);
  assert.match(validator, /FACEBOOK_AUTH_ENABLED/);
  assert.match(validator, /required_providers\+=\(facebook\.com\)/);
  assert.match(validator, /DEFERRED: FIREBASE_PROVIDER=facebook\.com/);
  assert.match(validator, /\.name/);
  assert.match(validator, /split\("\/"\) \| last/);
  assert.doesNotMatch(validator, /\.idpId/);
  assert.match(validator, /\.enabled == true/);
  assert.match(validator, /\.clientId/);
  assert.doesNotMatch(validator, /clientSecret|set \+x/);
  assert.match(workflow, /bash scripts\/validate-firebase-social-auth-readiness\.sh/);
  assert.match(workflow, /FACEBOOK_AUTH_ENABLED: \$\{\{ vars\.FACEBOOK_AUTH_ENABLED \|\| 'false' \}\}/);
  assert.match(validator, /IDENTITY_PROJECT="\$\{FIREBASE_PROJECT_ID:-\$GOOGLE_CLOUD_PROJECT\}"/);
  assert.match(previewWorkflow, /FIREBASE_PROJECT_ID: \$\{\{ vars\.PREVIEW_FIREBASE_PROJECT_ID \}\}/);
  assert.match(stagingWorkflow, /FIREBASE_PROJECT_ID: \$\{\{ vars\.STAGING_FIREBASE_PROJECT_ID \}\}/);
  assert.match(deployment, /bash scripts\/validate-firebase-social-auth-readiness\.sh/);
});
