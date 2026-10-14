import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readPreviewMailMetadata } from '../scripts/deployment/read-preview-mail-metadata.mjs';

const project = 'khedmah-preview-fixture';
const policy = { project_sha256: createHash('sha256').update(project).digest('hex'), namespace: '123456789', region: 'europe-west1' };
const env = { DEPLOYMENT_ENVIRONMENT: 'preview', GOOGLE_CLOUD_PROJECT: project, GOOGLE_CLOUD_REGION: policy.region,
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_FIREBASE_PROJECT_ID: 'khedma-dl',
  ARTIFACT_REPOSITORY: 'images', RUNTIME_SERVICE_ACCOUNT: `runtime@${project}.iam.gserviceaccount.com`,
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: `${project}:${policy.region}:preview-db`, PREVIEW_SCHEMA_POOL_SERIALIZED: 'true',
  GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'PR Preview', GITHUB_REPOSITORY: 'khedma-sy/khedmah-digital-v1' };
const parent = `projects/${policy.namespace}/secrets/RESEND_API_KEY`;
const version = state => ({ name: parent + '/versions/2', state });
const ok = data => ({ status: 0, stdout: JSON.stringify(data), stderr: '' });
const denied = permission => ({ status: 1, stdout: 'NEVER_PRINT_SENTINEL',
  stderr: `PERMISSION_DENIED: Permission '${permission}' denied (or it may not exist). NEVER_PRINT_SENTINEL` });
function fixture(responses = [ok({ name: parent }), ok([version('ENABLED')]), ok(version('ENABLED'))], overrides = {}) {
  const calls = [];
  const report = readPreviewMailMetadata({ ...env, ...overrides }, (tool, args, options) => {
    calls.push({ tool, args, options });
    return responses[calls.length - 1];
  }, policy);
  return { report, calls };
}

test('metadata reader uses three fixed projected reads and never accesses or mutates a payload', () => {
  const { report, calls } = fixture();
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(c => c.args.slice(0, 4)), [
    ['secrets', 'describe', 'RESEND_API_KEY', '--project=' + project],
    ['secrets', 'versions', 'list', 'RESEND_API_KEY'],
    ['secrets', 'versions', 'describe', 'latest'],
  ]);
  for (const { tool, args, options } of calls) {
    assert.equal(tool, 'gcloud'); assert.ok(args.includes('--project=' + project));
    assert.ok(args.includes('--user-output-enabled'));
    assert.ok(args.some(a => a.startsWith('--format=json(name')));
    assert.ok(!args.some(a => ['access', 'create', 'add', 'delete', 'enable', 'disable', 'destroy', 'deploy', 'execute', 'add-iam-policy-binding'].includes(a)));
    assert.equal(options.env.CLOUDSDK_CORE_LOG_HTTP, 'false');
    assert.equal(options.timeout, 45000); assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
  }
  assert.equal(report.secret_visible, true);
  assert.deepEqual(report.reads.latest, { outcome: 'OK', version: '2', state: 'ENABLED' });
  for (const key of ['cloud_mutation', 'secret_payload_access', 'runtime_access_verified', 'email_delivery_verified']) assert.equal(report[key], false);
});

test('denied reads expose only allowlisted error metadata and do not prove absence', () => {
  const { report, calls } = fixture(['secretmanager.secrets.get', 'secretmanager.versions.list', 'secretmanager.versions.get'].map(denied));
  assert.equal(calls.length, 3); assert.equal(report.existence_unconfirmed, true);
  assert.equal(report.secret_visible, false);
  assert.equal(report.reads.enabled_version.outcome, 'PERMISSION_DENIED');
  assert.deepEqual(report.reads.enabled_version.reported_permissions, ['secretmanager.versions.list']);
  assert.ok(!JSON.stringify(report).includes('NEVER_PRINT_SENTINEL'));
});

test('visible metadata separates a list-permission failure from latest-version state', () => {
  const { report } = fixture([ok({ name: parent }), denied('secretmanager.versions.list'), ok(version('DISABLED'))]);
  assert.equal(report.secret_visible, true); assert.equal(report.existence_unconfirmed, false);
  assert.equal(report.reads.latest.state, 'DISABLED');
  assert.equal(report.reads.enabled_version.outcome, 'PERMISSION_DENIED');
});

test('an empty enabled query and a destroyed latest are distinct from absent metadata', () => {
  const { report } = fixture([ok({ name: parent }), ok([]), ok(version('DESTROYED'))]);
  assert.equal(report.reads.enabled_version.enabled_version_present, false);
  assert.equal(report.reads.latest.state, 'DESTROYED');
  assert.equal(report.secret_visible, true);
});

test('not-found, disabled API and unknown errors stay qualified and sanitized', () => {
  const { report } = fixture(['NOT_FOUND: missing NEVER_PRINT_SENTINEL', 'SERVICE_DISABLED: NEVER_PRINT_SENTINEL', 'NEVER_PRINT_SENTINEL']
    .map(stderr => ({ status: 1, stdout: '', stderr })));
  assert.equal(report.reads.secret.outcome, 'NOT_FOUND_REPORTED');
  assert.equal(report.reads.enabled_version.outcome, 'API_UNAVAILABLE');
  assert.equal(report.reads.latest.outcome, 'UNCLASSIFIED_READ_FAILURE');
  assert.equal(report.existence_unconfirmed, true);
  assert.ok(!JSON.stringify(report).includes('NEVER_PRINT_SENTINEL'));
});

test('foreign, malformed or unexpected state metadata fails without raw output', () => {
  for (const responses of [
    [ok({ name: 'projects/foreign/secrets/RESEND_API_KEY' })],
    [{ status: 0, stdout: 'NEVER_PRINT_SENTINEL' }],
    [ok({ name: parent }), ok([version('DISABLED')])],
    [ok({ name: parent }), ok([version('ENABLED'), version('ENABLED')])],
    [ok({ name: parent }), ok([]), ok(version('STATE_UNSPECIFIED'))],
  ]) assert.throws(() => fixture(responses), /^Error: PREVIEW_MAIL_METADATA_INVALID_METADATA$/);
});

test('wrong environment, target, identities or serialized context stop before reads', () => {
  for (const key of Object.keys(env)) {
    let called = false;
    assert.throws(() => readPreviewMailMetadata({ ...env, [key]: '' }, () => { called = true; }, policy));
    assert.equal(called, false);
  }
  assert.throws(() => readPreviewMailMetadata(env, () => assert.fail('cloud call')));
});

test('local command failures and timeouts do not retry or expose the original error', () => {
  for (const response of [undefined, { status: null, signal: 'SIGTERM' }, { status: null, error: Error('NEVER_PRINT_SENTINEL') }]) {
    let calls = 0;
    assert.throws(() => readPreviewMailMetadata(env, () => { calls++; return response; }, policy), /^Error: PREVIEW_MAIL_METADATA_LOCAL_COMMAND_FAILED$/);
    assert.equal(calls, 1);
  }
});

test('workflow authenticates and validates before fresh metadata; any failed launch check holds rollout', () => {
  const workflow = readFileSync(new URL('../.github/workflows/preview-deployment.yml', import.meta.url), 'utf8');
  const start = workflow.indexOf('      - name: Read Preview mail metadata; hold completed rollout');
  const end = workflow.indexOf('      - name: Verify Preview inventory and pool before rollout', start);
  assert.ok(start > workflow.indexOf('run: node scripts/validate-environment-separation.mjs'));
  assert.ok(start > workflow.indexOf('run: node scripts/deployment/verify-preview-source.mjs'));
  assert.ok(end > start && end < workflow.indexOf('name: Deploy isolated PR services'));
  const step = workflow.slice(start, end);
  assert.match(step, /timeout-minutes: 5/);
  assert.doesNotMatch(step, /continue-on-error|always\(\)|versions access|deploy-cloud-run-environment/);
  const script = step.slice(step.indexOf('        run: |\n') + '        run: |\n'.length).split('\n').map(s => s.replace(/^          /, '')).join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'khedmah-mail-hold-'));
  try {
    writeFileSync(join(dir, 'node'), '#!/bin/sh\nexit "$MOCK_STATUS"\n', { mode: 0o755 });
    for (const status of ['0', '7']) {
      const result = spawnSync('bash', ['-c', script + '\necho ROLLOUT_MUST_NOT_RUN'], {
        encoding: 'utf8', env: { ...process.env, PATH: dir + ':' + process.env.PATH, MOCK_STATUS: status },
      });
      assert.equal(result.status === 0, status === '0');
      assert.equal(result.stdout.includes('ROLLOUT_MUST_NOT_RUN'), status === '0');
      // Real source/empty-inventory gates are exercised separately; denied metadata never proceeds.
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
