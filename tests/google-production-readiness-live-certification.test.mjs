import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('manual readiness locks exact latest main before the OIDC-capable job', async () => {
  const workflow = await read('.github/workflows/google-production-readiness.yml');
  const lockStart = workflow.indexOf('  lock-production-readiness-source:');
  const gateStart = workflow.indexOf('  production-secret-gate:');
  const validateStart = workflow.indexOf('  validate-files:');
  assert.ok(lockStart >= 0 && gateStart > lockStart && validateStart > gateStart);
  const lock = workflow.slice(lockStart, gateStart);
  const gate = workflow.slice(gateStart);
  assert.ok(lock.includes('test "$GITHUB_REPOSITORY" = "khedma-sy/khedmah-digital-v1"'));
  assert.ok(lock.includes('test "$GITHUB_REF" = "refs/heads/main"'));
  assert.ok(lock.includes('git fetch origin main'));
  assert.ok(lock.includes('git rev-parse origin/main'));
  assert.doesNotMatch(lock, /id-token/);
  assert.ok(gate.includes('needs: lock-production-readiness-source'));
  assert.ok(gate.includes('id-token: write'));
});

test('live certification pins exact distinct Terraform-created service accounts', async () => {
  const script = await read('scripts/validate-production-live-secret-certification.sh');
  for (const id of ['khedmah-v1-deployer', 'khedmah-v1-runtime', 'khedmah-v1-build', 'khedmah-v1-migrator']) {
    assert.ok(script.includes(`"${id}@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com"`), `missing canonical identity ${id}`);
  }
  assert.match(script, /identities must be distinct/);
  assert.match(script, /sort -u/);
});

test('live certification fails closed when inherited Secret Manager access is found or cannot be proven', async () => {
  const script = await read('scripts/validate-production-live-secret-certification.sh');
  assert.match(script, /gcloud projects get-ancestors/);
  assert.match(script, /gcloud asset analyze-iam-policy/);
  assert.match(script, /--full-resource-name="$resource"/);
  assert.match(script, /--permissions=secretmanager\.versions\.access/);
  assert.match(script, /--folder=/);
  assert.match(script, /--organization=/);
  assert.match(script, /fullyExplored == true/);
  assert.match(script, /nonCriticalErrors/);
  assert.match(script, /attachedResourceFullName != $resource/);
  assert.match(script, /refusing certification/);
});

test('live certification retains exact direct IAM checks and never reads secret payloads', async () => {
  const script = await read('scripts/validate-production-live-secret-certification.sh');
  assert.match(script, /gcloud secrets get-iam-policy/);
  assert.match(script, /actual_policy" = "$expected_policy/);
  assert.match(script, /READY: SECRET_PAYLOADS_READ=0/);
  assert.doesNotMatch(script, /gcloud secrets versions access/);
});
