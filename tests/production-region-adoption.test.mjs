import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const approved = 'europe-west1';
const contract = read('.env.production');
const names = [...contract.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(match => match[1]);
const injected = Object.fromEntries(names.map(name => [name, name.endsWith('_ENABLED') ? 'false' : 'test-placeholder']));
injected.GOOGLE_CLOUD_REGION = approved;
injected.GCS_MEDIA_LOCATION = approved;
const validate = overrides => spawnSync(process.execPath, ['scripts/validate-google-config.mjs', '--production'], {
  cwd: root, encoding: 'utf8', env: { ...injected, ...overrides }, timeout: 10000,
});

test('production region contract accepts only the owner-approved runtime and media region', () => {
  const result = validate({});
  assert.equal(result.status, 0, result.stderr);
  for (const name of ['GOOGLE_CLOUD_REGION', 'GCS_MEDIA_LOCATION']) {
    for (const value of ['me-central1', 'us-central1', 'EU', 'EUROPE-WEST1', '', 'europe-west1 ']) {
      const failed = validate({ [name]: value });
      assert.notEqual(failed.status, 0, `${name}=${value} was accepted`);
      assert.match(failed.stderr, new RegExp(name));
    }
  }
});

test('region literals cannot be smuggled into secret fields of the tracked contract', t => {
  const dir = mkdtempSync(join(tmpdir(), 'khedmah-region-contract-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = ['scripts/validate-google-config.mjs', 'config/google/google.ts', 'config/google/firebase.ts', 'config/google/maps.ts', 'infra/firebase/firebase.json', 'infra/secrets/required-secrets.yaml', 'infra/iac/main.tf'];
  for (const path of files) {
    const target = join(dir, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, read(path));
  }
  for (const value of ['europe-west1', 'false', 'test-placeholder']) {
    writeFileSync(join(dir, '.env.production'), contract.replace('FIREBASE_API_KEY=\n', `FIREBASE_API_KEY=${value}\n`));
    const result = spawnSync(process.execPath, ['scripts/validate-google-config.mjs'], { cwd: dir, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not contain populated credentials/);
  }
});

function mediaProbe(t, overrides = {}, metadata = {}, policyOverride) {
  const dir = mkdtempSync(join(tmpdir(), 'khedmah-region-readiness-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'calls');
  writeFileSync(log, '');
  const gcloud = join(bin, 'gcloud');
  writeFileSync(gcloud, `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$MOCK_LOG"
case "$1 $2 $3" in
  'storage buckets describe') printf '%s\\n' "$MOCK_METADATA" ;;
  'storage buckets get-iam-policy') printf '%s\\n' "$MOCK_POLICY" ;;
  *) echo 'Unexpected cloud operation' >&2; exit 90 ;;
esac
`);
  chmodSync(gcloud, 0o700);
  const runtime = 'khedma-v1-runtime@khedma-dl.iam.gserviceaccount.com';
  const bucket = {
    location: 'EUROPE-WEST1', uniform_bucket_level_access: true,
    public_access_prevention: 'enforced', versioning_enabled: true,
    soft_delete_policy: { retentionDurationSeconds: '2592000' }, ...metadata,
  };
  const policy = policyOverride ?? { bindings: [{ role: 'roles/storage.objectAdmin', members: [`serviceAccount:${runtime}`] }] };
  const result = spawnSync('bash', ['scripts/validate-media-storage-readiness.sh'], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GOOGLE_CLOUD_PROJECT: 'khedma-dl',
      GCS_MEDIA_LOCATION: approved, GCS_MEDIA_BUCKET: 'khedma-dl-khedmah-media',
      OPERATIONS_RUNTIME_SERVICE_ACCOUNT: runtime, MOCK_LOG: log,
      MOCK_METADATA: JSON.stringify(bucket), MOCK_POLICY: JSON.stringify(policy), ...overrides },
  });
  return { ...result, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
}

test('media readiness accepts approved metadata using read-only calls only', t => {
  const result = mediaProbe(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 2);
  for (const call of result.calls) assert.match(call, /^storage buckets (describe|get-iam-policy) /);
});

test('media readiness rejects the old configured location before any cloud call', t => {
  const result = mediaProbe(t, { GCS_MEDIA_LOCATION: 'me-central1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPECTED_MEDIA_LOCATION=europe-west1/);
  assert.equal(result.calls.length, 0);
});

test('approved region does not bypass actual location, privacy, versioning or retention checks', t => {
  for (const metadata of [
    { location: 'ME-CENTRAL1' }, { uniform_bucket_level_access: false },
    { public_access_prevention: 'inherited' }, { versioning_enabled: false },
    { soft_delete_policy: { retentionDurationSeconds: '604800' } },
  ]) {
    const result = mediaProbe(t, {}, metadata);
    assert.notEqual(result.status, 0, JSON.stringify(metadata));
    assert.equal(result.calls.length, 1);
  }
});

test('approved region does not bypass the runtime IAM or public-access checks', t => {
  for (const policy of [
    { bindings: [] },
    { bindings: [{ role: 'roles/storage.objectAdmin', members: ['allUsers'] }] },
    { bindings: [{ role: 'roles/storage.objectAdmin', members: ['allAuthenticatedUsers'] }] },
    { bindings: [{ role: 'roles/storage.objectAdmin', members: ['serviceAccount:wrong@khedma-dl.iam.gserviceaccount.com'] }] },
  ]) assert.notEqual(mediaProbe(t, {}, {}, policy).status, 0);
});

test('production planning and state handoff pin the region without an implicit media fallback', () => {
  assert.match(read('infra/iac/media/variables.tf'), /var\.location == "europe-west1"/);
  assert.match(read('scripts/plan-media-storage.sh'), /EXPECTED_MEDIA_LOCATION=europe-west1/);
  assert.match(read('.github/workflows/terraform-media-state-handoff.yml'), /test "\$\{bucket_location,,\}" = europe-west1/);
  assert.match(read('.github/workflows/terraform-media-plan.yml'), /GCS_MEDIA_LOCATION: \$\{\{ vars\.GCS_MEDIA_LOCATION \}\}/);
  assert.doesNotMatch(read('.github/workflows/terraform-media-plan.yml'), /GCS_MEDIA_LOCATION[^\n]*\|\|/);
});

test('active production defaults use europe-west1 without changing explicit staging configuration', () => {
  for (const path of [
    'infra/iac/variables.tf', 'infra/iac/bootstrap/variables.tf', 'infra/iac/client-maps/variables.tf',
    'infra/iac/bootstrap/production.tfvars.example', 'scripts/bootstrap-new-production-project.sh',
    'scripts/configure-new-production-database-secret.sh', 'cloudbuild.production-new-account.yaml',
    'cloudbuild.production-baseline-001-020.yaml', 'cloudbuild.production-migrations-025-034.yaml',
    'cloudbuild.database-role-bootstrap.yaml',
  ]) {
    assert.ok(read(path).includes(approved), `${path}: approved region missing`);
    assert.ok(!read(path).includes('me-central1'), `${path}: stale region default`);
  }
  assert.match(read('infra/iac/bootstrap/staging.tfvars.example'), /region\s*= "me-central1"/);
});
