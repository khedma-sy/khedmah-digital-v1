import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const protectedBucket = {
  location: 'EUROPE-WEST1', uniform_bucket_level_access: true,
  public_access_prevention: 'enforced', versioning_enabled: true,
};
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'khedmah-state-region-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const calls = join(dir, 'calls'); writeFileSync(calls, '');
  const mock = `#!/bin/bash
printf '%s %s\\n' "\${0##*/}" "$*" >> "$CALL_LOG"
if [[ "\${0##*/}" == gcloud ]]; then
  case "$1 $2 \${3:-}" in
    "config set project") exit 0 ;;
    "storage buckets list") printf '%s\\n' state-bucket; exit 0 ;;
    "storage buckets describe") printf '%s\\n' "$BUCKET_JSON"; exit "\${BUCKET_EXIT:-0}" ;;
  esac
fi
exit 87
`;
  for (const tool of ['gcloud', 'terraform', 'node', 'curl']) {
    writeFileSync(join(bin, tool), mock, { mode: 0o755 });
  }
  const plan = join(dir, 'plan'); writeFileSync(plan, 'sentinel');
  return { dir, calls, env: {
    PATH: `${bin}:${process.env.PATH}`, HOME: dir, CALL_LOG: calls,
    BUCKET_JSON: JSON.stringify(protectedBucket),
    GOOGLE_CLOUD_PROJECT: 'test-project', PRODUCTION_GOOGLE_CLOUD_PROJECT: 'test-project',
    GOOGLE_CLOUD_REGION: 'europe-west1', GCS_MEDIA_LOCATION: 'europe-west1',
    TF_STATE_LOCATION: 'europe-west1', TF_STATE_BUCKET: 'state-bucket',
    REQUESTED_STATE_BUCKET: 'state-bucket', CONFIGURED_STATE_BUCKET: 'state-bucket',
    GCS_MEDIA_BUCKET: 'media-bucket', OPERATIONS_RUNTIME_SERVICE_ACCOUNT: 'runtime@test-project.iam.gserviceaccount.com',
    LEGACY_ROOT_STATE_LINEAGE: 'reviewed-lineage', LEGACY_ROOT_STATE_SERIAL: '42',
    ROOT_STATE_ABSENT: 'false', FIRST_MEDIA_APPLY: 'false', MODE: 'VERIFY_EMPTY_ROOT',
    OPERATIONS_APPROVED_PRODUCTION: 'true', OPERATIONS_BACKEND_SERVICE: 'backend',
    OPERATIONS_FRONTEND_SERVICE: 'frontend', NEXT_PUBLIC_SITE_URL: 'https://example.test',
    OPERATIONS_EVIDENCE_DIRECTORY: join(dir, 'evidence'), PLAN_FILE: plan, PLAN_JSON: plan,
  }};
}
function run(ctx, command, env = ctx.env) {
  return spawnSync('/bin/bash', ['-c', command], { cwd: ctx.dir, env, encoding: 'utf8', timeout: 5000 });
}
function step(file, name) {
  const source = read(`.github/workflows/${file}`);
  const start = source.indexOf(`      - name: ${name}\n`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = source.indexOf('\n      - ', start + 1);
  const block = source.slice(start, end < 0 ? undefined : end);
  const body = block.split('        run: |\n')[1];
  assert.ok(body);
  return body.split('\n').map(line => line.replace(/^          /, '')).join('\n');
}
const entrypoints = [
  ['plan-existing-root', `bash "${join(root, 'scripts/plan-media-storage.sh')}"`, {}],
  ['plan-absent-root', `bash "${join(root, 'scripts/plan-media-storage.sh')}"`, {
    LEGACY_ROOT_STATE_LINEAGE: 'ABSENT', LEGACY_ROOT_STATE_SERIAL: '0',
  }],
  ['apply', step('terraform-media-apply.yml', 'Verify target, states and approved plan'), {}],
  ['handoff', step('terraform-media-state-handoff.yml', 'Verify legacy root state authority'), {}],
];
for (const [name, command, overrides] of entrypoints) {
  for (const [label, value] of [['stale', 'ME-CENTRAL1'], ['missing', undefined], ['malformed', 7]]) {
    test(`${name}: reject ${label} actual state region before accessing state`, t => {
      const ctx = fixture(t);
      const result = run(ctx, command, { ...ctx.env, ...overrides, BUCKET_JSON: JSON.stringify({ ...protectedBucket, location: value }) });
      assert.notEqual(result.status, 0);
      const calls = readFileSync(ctx.calls, 'utf8');
      assert.match(calls, /gcloud storage buckets describe/);
      assert.doesNotMatch(calls, /terraform |gcloud storage (?:objects|ls|cp|rm)/);
    });
  }
  test(`${name}: a failed metadata read never permits backend access`, t => {
    const ctx = fixture(t);
    const result = run(ctx, command, { ...ctx.env, ...overrides, BUCKET_EXIT: '9' });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(readFileSync(ctx.calls, 'utf8'), /terraform |gcloud storage (?:objects|ls|cp|rm)/);
  });
  test(`${name}: approved state region reaches the next mocked state gate`, t => {
    const ctx = fixture(t);
    const result = run(ctx, command, { ...ctx.env, ...overrides });
    assert.notEqual(result.status, 0, 'the state sentinel must still stop this isolated run');
    const calls = readFileSync(ctx.calls, 'utf8');
    const metadata = calls.indexOf('gcloud storage buckets describe');
    const state = calls.search(/terraform |gcloud storage (?:objects|ls)/);
    assert.ok(metadata >= 0 && state > metadata, calls);
  });
}
for (const file of ['terraform-media-plan.yml', 'terraform-media-apply.yml', 'terraform-media-state-handoff.yml']) {
  test(`${file}: state location is a required independent protected setting`, t => {
    const ctx = fixture(t);
    const source = read(`.github/workflows/${file}`);
    assert.match(source, /^      TF_STATE_LOCATION: \$\{\{ vars\.TF_STATE_LOCATION \}\}$/m);
    const guard = step(file, 'Reject unapproved Production hosting region');
    const env = { ...ctx.env }; delete env.TF_STATE_LOCATION;
    const result = run(ctx, guard, env);
    assert.equal(result.status, 64);
    assert.match(result.stderr, /TF_STATE_LOCATION must be europe-west1/);
    assert.equal(readFileSync(ctx.calls, 'utf8'), '');
  });
}
test('handoff discovery checks candidate location before looking for state objects', t => {
  const ctx = fixture(t);
  const result = run(ctx, entrypoints[3][1], {
    ...ctx.env, REQUESTED_STATE_BUCKET: '', CONFIGURED_STATE_BUCKET: '',
    BUCKET_JSON: JSON.stringify({ ...protectedBucket, location: 'ME-CENTRAL1' }),
  });
  assert.notEqual(result.status, 0);
  const calls = readFileSync(ctx.calls, 'utf8');
  assert.match(calls, /gcloud storage buckets describe/);
  assert.doesNotMatch(calls, /terraform |gcloud storage (?:objects|ls|cp|rm)/);
});
for (const value of [undefined, '', 'me-central1']) {
  test(`live certification: reject media location ${String(value)} before cloud reads`, t => {
    const ctx = fixture(t);
    const env = { ...ctx.env, GCS_MEDIA_LOCATION: value };
    if (value === undefined) delete env.GCS_MEDIA_LOCATION;
    const result = run(ctx, `bash "${join(root, 'scripts/run-live-production-certification.sh')}"`, env);
    assert.equal(result.status, 64);
    assert.match(result.stderr, /GCS_MEDIA_LOCATION must be europe-west1/);
    assert.equal(readFileSync(ctx.calls, 'utf8'), '');
  });
}
