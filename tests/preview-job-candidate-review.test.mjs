import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { reviewPreviewCandidates, summarizeExecutions } from '../scripts/deployment/preview-job-candidate-review.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const project = 'khedmah-preview-fixture';
const env = {
  DEPLOYMENT_ENVIRONMENT: 'preview', PREVIEW_GOOGLE_CLOUD_PROJECT: project,
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', GOOGLE_CLOUD_REGION: 'europe-west1',
  PREVIEW_RUNTIME_SERVICE_ACCOUNT: 'runtime@' + project + '.iam.gserviceaccount.com',
};
const identifier = 'pr-12-' + 'a'.repeat(40);
const name = 'khedmah-preview-classifieds-025-' + hash(identifier).slice(0, 10);
const created = '2026-09-10T18:17:58.893322Z';
const manifest = {
  project_sha256: hash(project), region: 'europe-west1',
  candidates: [{ name, created_at: created }],
};
function job() {
  return {
    metadata: { name, uid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', namespace: '123456789',
      creationTimestamp: created, labels: { 'cloud.googleapis.com/location': 'europe-west1' } },
    spec: { template: { spec: { template: { spec: {
      serviceAccountName: env.PREVIEW_RUNTIME_SERVICE_ACCOUNT,
      containers: [{ image: 'europe-west1-docker.pkg.dev/' + project + '/images/classifieds-migration:preview-' + identifier,
        env: [{ value: 'DO_NOT_PRINT_SENTINEL' }] }],
    } } } } },
    status: { executionCount: 2 },
  };
}
function execution(suffix = 'abc12', terminal = true) {
  return {
    metadata: { name: name + '-' + suffix, namespace: '123456789', creationTimestamp: created,
      labels: { 'run.googleapis.com/job': name } },
    status: terminal ? {
      completionTime: '2026-09-10T18:18:58Z', conditions: [{ type: 'Completed', status: 'True', message: 'DO_NOT_PRINT_SENTINEL' }],
    } : { runningCount: 0, conditions: [{ type: 'Completed', status: 'Unknown' }] },
  };
}
const runner = (j = job(), xs = [execution()]) => (command, args) => {
  assert.equal(command, 'gcloud');
  assert.ok(args.includes('--project=' + project));
  assert.ok(args.includes('--region=europe-west1'));
  if (args[2] === 'describe') return JSON.stringify(j);
  assert.deepEqual(args.slice(0, 4), ['run', 'jobs', 'executions', 'list']);
  assert.ok(args.includes('--limit=1001'));
  assert.ok(!args.some(arg => arg.startsWith('--filter')));
  return JSON.stringify(xs);
};

test('only performs two projected read commands, derives source and preserves hold', () => {
  const calls = [];
  const result = reviewPreviewCandidates(env, (command, args, options) => {
    calls.push(args);
    assert.equal(options.env.CLOUDSDK_CORE_LOG_HTTP, 'false');
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
    return runner()(command, args);
  }, manifest);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].at(-1).includes('containers[].image'));
  assert.ok(calls.every(args => !args.at(-1).includes('containers.env')));
  assert.equal(result.records[0].source_pr, 12);
  assert.equal(result.records[0].identifier_hash_matches_name, true);
  assert.equal(result.records[0].runtime_identity_matches_preview, true);
  assert.equal(result.records[0].nonterminal_or_unknown_count, 0);
  assert.equal(result.records[0].ownership_review_required, true);
  assert.equal(result.cleanup_authorized, false);
  assert.equal(result.deployment_hold_required, true);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT_SENTINEL'));
});

test('exact project, both production exclusions, region and manifest guards precede cloud access', () => {
  for (const override of [
    { DEPLOYMENT_ENVIRONMENT: 'production' }, { GOOGLE_CLOUD_REGION: 'us-central1' },
    { PREVIEW_GOOGLE_CLOUD_PROJECT: 'khedma-dl' },
    { PREVIEW_GOOGLE_CLOUD_PROJECT: 'khedmah-preview-other' },
    { PRODUCTION_GOOGLE_CLOUD_PROJECT: project }, { PRODUCTION_GOOGLE_CLOUD_PROJECT: '' },
  ]) assert.throws(() => reviewPreviewCandidates({ ...env, ...override }, () => assert.fail('cloud called'), manifest), /TARGET_REJECTED/);
  for (const candidates of [[], Array(21).fill(manifest.candidates[0]), [manifest.candidates[0], manifest.candidates[0]],
    [{ name: 'khedmah-staging-job', created_at: created }]]) {
    assert.throws(() => reviewPreviewCandidates(env, () => assert.fail('cloud called'), { ...manifest, candidates }), /REJECTED|INVALID/);
  }
  const drift = reviewPreviewCandidates({ ...env, PRODUCTION_GOOGLE_CLOUD_PROJECT: 'previous-prod-fixture' }, runner(), manifest);
  assert.equal(drift.configured_production_matches_canonical, false);
  assert.equal(drift.deployment_hold_required, true);
});

test('denial or malformed cloud JSON stops immediately without retry or raw stderr', () => {
  for (const deniedAt of [1, 2]) {
    let calls = 0;
    assert.throws(() => reviewPreviewCandidates(env, (command, args) => {
      calls++;
      if (calls === deniedAt) throw new Error('PERMISSION_DENIED DO_NOT_PRINT_SENTINEL');
      return runner()(command, args);
    }, manifest), /^Error: PREVIEW_CANDIDATE_READ_FAILED_STOP_NO_RETRY$/);
    assert.equal(calls, deniedAt);
  }
  assert.throws(() => reviewPreviewCandidates(env, () => 'DO_NOT_PRINT_SENTINEL', manifest), /READ_FAILED/);
});

test('recreated, foreign or malformed jobs are rejected before execution reads', () => {
  for (const mutate of [
    j => { j.metadata.creationTimestamp = '2026-10-11T15:00:00Z'; },
    j => { j.metadata.name = 'another-job'; },
    j => { j.metadata.namespace = ''; },
    j => { j.metadata.uid = ''; },
    j => { j.metadata.labels['cloud.googleapis.com/location'] = 'us-central1'; },
    j => { j.spec.template.spec.template.spec.containers = []; },
  ]) {
    const j = job(); mutate(j);
    let calls = 0;
    assert.throws(() => reviewPreviewCandidates(env, (c, a) => { calls++; return runner(j)(c, a); }, manifest), /INVALID/);
    assert.equal(calls, 1);
  }
});

test('an earlier pending execution blocks an all-terminal conclusion despite latest success', () => {
  const summary = summarizeExecutions([execution('early', false), execution('later')], name, '123456789');
  assert.equal(summary.nonterminal_or_unknown_count, 1);
  for (const mutate of [
    x => { delete x.status.completionTime; },
    x => { x.status.runningCount = 1; },
    x => { x.status.conditions = []; },
    x => { x.status.conditions[0].status = 'Unknown'; },
  ]) {
    const x = execution(); mutate(x);
    assert.equal(summarizeExecutions([x], name, '123456789').nonterminal_or_unknown_count, 1);
  }
  const failed = execution(); failed.status.conditions[0].status = 'False';
  assert.equal(summarizeExecutions([failed], name, '123456789').nonterminal_or_unknown_count, 0);
});

test('truncated, duplicate and wrong-job execution results fail closed', () => {
  for (const xs of [null, {}, Array(1001).fill(execution()), [execution(), execution()]]) {
    assert.throws(() => summarizeExecutions(xs, name, '123456789'), /INVALID|INCOMPLETE/);
  }
  for (const mutate of [
    x => { x.metadata.labels['run.googleapis.com/job'] = 'different'; },
    x => { x.metadata.namespace = '987654321'; },
    x => { x.status.runningCount = '0'; },
    x => { x.status.completionTime = 'bad'; },
    x => { x.status.conditions[0].status = 'invalid'; },
  ]) {
    const x = execution(); mutate(x);
    assert.throws(() => summarizeExecutions([x], name, '123456789'), /INVALID/);
  }
});

test('empty retained history and unrecognized source do not certify ownership or cleanup', () => {
  const j = job();
  j.spec.template.spec.template.spec.containers[0].image = 'europe-west1-docker.pkg.dev/' + project + '/images/unknown@sha256:' + 'a'.repeat(64);
  const result = reviewPreviewCandidates(env, runner(j, []), manifest);
  assert.equal(result.records[0].retained_execution_count, 0);
  assert.equal(result.records[0].source_pr, null);
  assert.equal(result.records[0].ownership_review_required, true);
  assert.equal(result.cleanup_authorized, false);
});

test('workflow retains authentication, isolation and unconditional deployment stop', () => {
  const source = readFileSync(new URL('../.github/workflows/preview-deployment.yml', import.meta.url), 'utf8');
  const start = source.indexOf('- name: Delete approved twenty Preview Jobs');
  const end = source.indexOf('- id: classifieds-stage', start);
  assert.ok(start > source.indexOf('run: node scripts/validate-environment-separation.mjs'));
  const step = source.slice(start, end);
  assert.match(step, /timeout-minutes: 10/);
  assert.match(step, /set -euo pipefail/);
  assert.ok(start > source.indexOf('uses: google-github-actions/auth@v3'));
  assert.match(step, /node scripts\/deployment\/preview-job-cleanup.mjs --confirm DELETE_KHEDMAH_PREVIEW_20_fd1117bf33c2a788/);
  assert.match(step, /PREVIEW_CLEANUP_COMPLETE_DEPLOYMENT_HELD/);
  assert.match(step, /exit 1/);
  assert.doesNotMatch(step, /continue-on-error|jobs delete|jobs execute|jobs deploy/);
});


