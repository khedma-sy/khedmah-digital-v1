import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Source-contract coverage; a real Terraform import is a separate integration check.
const source = await readFile(
  new URL('../infra/iac/bootstrap/main.tf', import.meta.url),
  'utf8',
);

function resourceBody(type, name) {
  const pattern = new RegExp(`^resource "${type}" "${name}" \\{\\n([\\s\\S]*?)^\\}`, 'gm');
  const matches = [...source.matchAll(pattern)];
  assert.equal(matches.length, 1, `expected exactly one ${type}.${name} resource`);
  return matches[0][1].split('\n').filter(line => !/^\s*(#|\/\/)/.test(line)).join('\n');
}

const runtimeSecrets = resourceBody('google_secret_manager_secret', 'runtime');
const runtimeIam = resourceBody('google_secret_manager_secret_iam_member', 'runtime');

test('runtime secret IAM instance keys come directly from the configured secret set', () => {
  // The set keeps the same string instance addresses while avoiding import-time unknown keys.
  for (const body of [runtimeSecrets, runtimeIam]) {
    assert.match(body, /^\s*for_each\s*=\s*var\.runtime_secret_names\s*$/m);
  }
  assert.doesNotMatch(runtimeIam, /^\s*for_each\s*=\s*google_secret_manager_secret\.runtime/m);
  assert.doesNotMatch(runtimeIam, /^\s*count\s*=/m);
});

test('runtime secret IAM retains its resource dependency and exact accessor binding', () => {
  assert.match(runtimeIam, /^\s*secret_id\s*=\s*google_secret_manager_secret\.runtime\[each\.key\]\.secret_id\s*$/m);
  assert.match(runtimeIam, /^\s*project\s*=\s*var\.project_id\s*$/m);
  assert.match(runtimeIam, /^\s*role\s*=\s*"roles\/secretmanager\.secretAccessor"\s*$/m);
  assert.match(runtimeIam, /^\s*member\s*=\s*"serviceAccount:\$\{google_service_account\.runtime\.email\}"\s*$/m);
});

test('build secret IAM retains its separately scoped inventory and identity', () => {
  const buildIam = resourceBody('google_secret_manager_secret_iam_member', 'build');
  assert.match(buildIam, /^\s*for_each\s*=\s*local\.build_secret_names\s*$/m);
  assert.match(buildIam, /^\s*secret_id\s*=\s*google_secret_manager_secret\.runtime\[each\.value\]\.secret_id\s*$/m);
  assert.match(buildIam, /^\s*role\s*=\s*"roles\/secretmanager\.secretAccessor"\s*$/m);
  assert.match(buildIam, /^\s*member\s*=\s*"serviceAccount:\$\{google_service_account\.build\.email\}"\s*$/m);
});

test('Cloud Build retains permission to attach the runtime identity', () => {
  const binding = resourceBody('google_service_account_iam_member', 'build_runtime_user');
  assert.match(binding, /^\s*service_account_id\s*=\s*google_service_account\.runtime\.name\s*$/m);
  assert.match(binding, /^\s*role\s*=\s*"roles\/iam\.serviceAccountUser"\s*$/m);
  assert.match(binding, /^\s*member\s*=\s*"serviceAccount:\$\{google_service_account\.build\.email\}"\s*$/m);
});
