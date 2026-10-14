import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolvePreviewFirebaseBinding } from '../scripts/deployment/resolve-preview-firebase-config.mjs';

const project = 'khedmah-preview-v2-20261012';
const env = { ...process.env, DEPLOYMENT_ENVIRONMENT: 'preview', GOOGLE_CLOUD_PROJECT: project,
  GOOGLE_CLOUD_REGION: 'europe-west1', ARTIFACT_REPOSITORY: 'khedmah-preview',
  RUNTIME_SERVICE_ACCOUNT: `khedmah-pv2-runtime@${project}.iam.gserviceaccount.com`,
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: `${project}:europe-west1:khedmah-preview-v2-db`,
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_FIREBASE_PROJECT_ID: 'khedma-dl',
  PREVIEW_SCHEMA_POOL_SERIALIZED: 'true', GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'PR Preview',
  GITHUB_REPOSITORY: 'khedma-sy/khedmah-digital-v1' };
const metadata = (parent = '1044962071847', state = 'ENABLED', version = '1') => ({
  name: `projects/${parent}/secrets/FIREBASE_API_KEY/versions/${version}`, state,
});
const success = value => ({ status: 0, stdout: JSON.stringify(value), stderr: '' });

test('Preview Firebase binding uses only version-1 metadata and emits a backend reference', () => {
  for (const parent of [project, '1044962071847']) {
    let calls = 0;
    const binding = resolvePreviewFirebaseBinding(env, (tool, args, options) => {
      calls++;
      assert.equal(tool, 'gcloud');
      assert.deepEqual(args.slice(0, 5), ['secrets', 'versions', 'describe', '1', '--secret=FIREBASE_API_KEY']);
      assert.ok(args.includes('--project=' + project));
      assert.ok(args.includes('--format=json(name,state)'));
      assert.ok(!args.some(x => /access|latest|NEXT_PUBLIC/.test(x)));
      assert.equal(options.env.CLOUDSDK_CORE_DISABLE_FILE_LOGGING, 'true');
      assert.equal(options.env.CLOUDSDK_CORE_LOG_HTTP, 'false');
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
      return success(metadata(parent));
    });
    assert.equal(calls, 1);
    assert.equal(binding, 'FIREBASE_API_KEY=FIREBASE_API_KEY:1');
  }
});

for (const [name, value] of [
  ['disabled', metadata('1044962071847', 'DISABLED')],
  ['destroyed', metadata('1044962071847', 'DESTROYED')],
  ['another version', metadata('1044962071847', 'ENABLED', '2')],
  ['foreign project', metadata('999999999999')],
  ['browser secret', { ...metadata(), name: metadata().name.replace('/FIREBASE_API_KEY/', '/NEXT_PUBLIC_FIREBASE_API_KEY/') }],
  ['missing', {}], ['array', [metadata()]],
]) test(`Preview Firebase binding rejects ${name} without fallback`, () => {
  assert.throws(() => resolvePreviewFirebaseBinding(env, () => success(value)), /PINNED_VERSION_NOT_READY/);
});

test('Preview Firebase binding rejects unavailable or invalid metadata without exposing raw errors', () => {
  for (const response of [null, { status: 1, stdout: 'private-fixture', stderr: 'private-fixture' },
    { status: 0, stdout: 'private-fixture' }, { status: null, signal: 'SIGTERM' },
    { status: 0, error: new Error('private-fixture'), stdout: JSON.stringify(metadata()) }]) {
    assert.throws(() => resolvePreviewFirebaseBinding(env, () => response), error =>
      error.message.startsWith('PREVIEW_FIREBASE_BINDING_') && !error.message.includes('private-fixture'));
  }
  assert.throws(() => resolvePreviewFirebaseBinding(env, () => { throw new Error('private-fixture'); }), /METADATA_READ_UNCONFIRMED/);
});

test('Preview Firebase binding rejects drifted execution identity before cloud reads', () => {
  for (const overrides of [
    { DEPLOYMENT_ENVIRONMENT: 'production' }, { GOOGLE_CLOUD_PROJECT: 'khedma-dl' },
    { GOOGLE_CLOUD_PROJECT: 'khedmah-preview-other' }, { PRODUCTION_FIREBASE_PROJECT_ID: '' },
    { RUNTIME_SERVICE_ACCOUNT: `khedmah-pv2-frontend@${project}.iam.gserviceaccount.com` },
    { ARTIFACT_REPOSITORY: 'foreign-repo' }, { GOOGLE_CLOUD_REGION: 'us-central1' },
    { CLOUD_SQL_INSTANCE_CONNECTION_NAME: `${project}:europe-west1:foreign-db` },
  ]) assert.throws(() => resolvePreviewFirebaseBinding({ ...env, ...overrides }, () => assert.fail('unexpected cloud read')));
});

test('real resolver CLI keeps failed gcloud output private and returns no reference', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preview-firebase-binding-'));
  try {
    const path = join(dir, 'gcloud');
    writeFileSync(path, '#!/bin/sh\necho private-fixture-out\necho private-fixture-error >&2\nexit 1\n');
    chmodSync(path, 0o755);
    const result = spawnSync(process.execPath, ['scripts/deployment/resolve-preview-firebase-config.mjs'], {
      encoding: 'utf8', env: { ...env, PATH: dir + ':' + process.env.PATH },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'STOP: PREVIEW_FIREBASE_BINDING_METADATA_READ_UNCONFIRMED');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Firebase source binding stays behind the first-rollout workflow gates and before mutation', () => {
  const source = readFileSync('scripts/deployment/deploy-cloud-run-environment.sh', 'utf8');
  const resolver = source.indexOf('DEPLOYMENT_ENVIRONMENT=preview node scripts/deployment/resolve-preview-firebase-config.mjs');
  assert.ok(resolver > source.indexOf('resolve_application_execution "$environment"'));
  assert.ok(resolver < source.indexOf('resolve-preview-email-config.sh'));
  assert.ok(resolver < source.indexOf('ensure-foundation-nonproduction-schema.sh'));
  const workflow = readFileSync('.github/workflows/preview-deployment.yml', 'utf8');
  const hold = workflow.indexOf('PREVIEW_MAIL_METADATA_COMPLETE_DEPLOYMENT_HELD');
  assert.ok(hold > 0 && hold < workflow.indexOf('run: scripts/deployment/deploy-cloud-run-environment.sh'));
  assert.match(workflow.slice(hold), /exit 1\n/);
});
