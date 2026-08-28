import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production readiness blocks missing social providers and unauthorized domains', async () => {
  const [validator, prerequisites, workflow] = await Promise.all([
    read('scripts/validate-firebase-social-auth-readiness.sh'),
    read('scripts/validate-production-deployment-readiness.sh'),
    read('.github/workflows/production-operator.yml')
  ]);

  assert.match(prerequisites, /identitytoolkit\.googleapis\.com/);
  assert.match(validator, /\.authorizedDomains/);
  assert.match(validator, /google\.com facebook\.com/);
  assert.match(validator, /\.enabled == true/);
  assert.match(validator, /\.clientId/);
  assert.doesNotMatch(validator, /clientSecret|set \+x/);
  assert.match(workflow, /bash scripts\/validate-firebase-social-auth-readiness\.sh/);
});
