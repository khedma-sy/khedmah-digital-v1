import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { checkSchemaJob, schemaJobName, validatePoolTarget, STAGES } from '../scripts/deployment/preview-schema-job-pool.mjs';
import { verifyPreviewSource } from '../scripts/deployment/verify-preview-source.mjs';

const hash = x => createHash('sha256').update(x).digest('hex');
const project = 'khedmah-preview-fixture';
const policy = { project_sha256: hash(project), namespace: '123456789', region: 'europe-west1' };
const env = { GOOGLE_CLOUD_PROJECT: project, GOOGLE_CLOUD_REGION: policy.region,
  ARTIFACT_REPOSITORY: 'images', RUNTIME_SERVICE_ACCOUNT: 'runtime@' + project + '.iam.gserviceaccount.com',
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: project + ':europe-west1:preview-db',
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_FIREBASE_PROJECT_ID: 'khedma-dl',
  PREVIEW_SCHEMA_POOL_SERIALIZED: 'true', GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'PR Preview',
  GITHUB_REPOSITORY: 'khedma-sy/khedmah-digital-v1' };
const identifier = 'pr-274-' + 'a'.repeat(40), stage = 'classifieds-025';
const name = schemaJobName('preview', identifier, stage);
function fixture() {
  const execution = suffix => ({ metadata: { name: name + '-' + suffix, namespace: policy.namespace,
    creationTimestamp: '2026-10-11T10:00:00Z', labels: { 'run.googleapis.com/job': name } },
    status: { completionTime: '2026-10-11T10:01:00Z', runningCount: 0,
      conditions: [{ type: 'Completed', status: 'True' }] } });
  const job = { metadata: { name, namespace: policy.namespace, uid: 'a'.repeat(32), generation: 2,
    labels: { 'cloud.googleapis.com/location': policy.region, 'khedmah-schema-pool': 'bounded-v1', 'khedmah-schema-stage': stage } },
    spec: { template: { metadata: { annotations: { 'run.googleapis.com/cloudsql-instances': env.CLOUD_SQL_INSTANCE_CONNECTION_NAME } },
      spec: { template: { spec: { serviceAccountName: env.RUNTIME_SERVICE_ACCOUNT,
        containers: [{ image: policy.region + '-docker.pkg.dev/' + project + '/images/classifieds-migration:preview-' + identifier }] } } } } },
    status: { observedGeneration: 2, executionCount: 2, latestCreatedExecution: { name: name + '-new' }, conditions: [{ type: 'Ready', status: 'True' }] } };
  const f = { job, inventory: [{ metadata: { name } }], executions: [execution('old'), execution('new')], calls: [] };
  f.run = (command, args, options) => {
    f.calls.push({ command, args, options });
    assert.equal(command, 'gcloud');
    assert.ok(args.includes('--project=' + project));
    assert.ok(args.includes('--region=' + policy.region));
    assert.ok(!args.some(x => /^(delete|deploy|execute|update)$/.test(x)));
    if (args[2] === 'list') return JSON.stringify(f.inventory);
    if (args[2] === 'describe') return JSON.stringify(f.job);
    if (args[2] === 'executions') return JSON.stringify(f.executions);
    assert.fail('Unexpected command');
  };
  f.check = (phase = 'before-deploy', overrides = {}) => checkSchemaJob({ ...env, ...overrides }, 'preview', identifier, stage, phase, f.run, policy);
  return f;
}

test('many PRs and revisions use exactly nine names; Staging keeps its old name formula', () => {
  const names = new Set();
  for (const s of Object.keys(STAGES)) for (const id of [identifier, 'pr-999-' + 'b'.repeat(40)]) {
    names.add(schemaJobName('preview', id, s));
    assert.equal(schemaJobName('staging', id, s), 'khedmah-staging-' + s + '-' + hash(id).slice(0, 10));
  }
  assert.equal(names.size, 9);
  for (const n of names) assert.ok(n.length <= 54);
  assert.throws(() => schemaJobName('production', identifier, stage));
  assert.throws(() => schemaJobName('preview', 'not-a-pr', stage));
  assert.throws(() => schemaJobName('preview', identifier, 'unreviewed-stage'));
});

test('target, canonical Production identities and serialized Actions context are required before cloud reads', () => {
  for (const key of Object.keys(env)) {
    const f = fixture();
    assert.throws(() => f.check('before-deploy', { [key]: '' }), /TARGET_OR_SERIALIZATION_REJECTED/);
    assert.equal(f.calls.length, 0);
  }
  for (const overrides of [{ GOOGLE_CLOUD_PROJECT: 'khedma-dl' },
    { PRODUCTION_GOOGLE_CLOUD_PROJECT: 'previous-prod-fixture' }, { PRODUCTION_FIREBASE_PROJECT_ID: 'previous-prod-fixture' },
    { RUNTIME_SERVICE_ACCOUNT: 'runtime@foreign-project.iam.gserviceaccount.com' }]) {
    assert.throws(() => fixture().check('before-deploy', overrides), /TARGET_OR_SERIALIZATION_REJECTED/);
  }
  assert.throws(() => validatePoolTarget(env), /TARGET_OR_SERIALIZATION_REJECTED/); // Fixture cannot select the live project.
});

test('Staging performs no pool reads or new target-policy checks', () => {
  assert.match(checkSchemaJob({}, 'staging', 'reviewed-revision', stage, 'before-deploy', () => assert.fail('cloud call')), /^khedmah-staging-/);
});

test('only a complete successful inventory proves a pool slot absent', () => {
  const f = fixture(); f.inventory = [];
  assert.equal(f.check(), name);
  assert.equal(f.calls.length, 1);
  assert.throws(() => f.check('before-execute'), /JOB_MISSING_AFTER_DEPLOY/);
  for (const list of [null, {}, [{ metadata: {} }], Array(2000).fill({ metadata: { name } }), [{ metadata: { name } }, { metadata: { name } }]]) {
    const bad = fixture(); bad.inventory = list; assert.throws(() => bad.check(), /INVENTORY_INVALID/);
  }
});

test('read denial and malformed JSON stop without a mutation, retry or raw error', () => {
  for (const result of [null, 'not-json']) {
    let calls = 0;
    assert.throws(() => checkSchemaJob(env, 'preview', identifier, stage, 'before-deploy', () => {
      calls++; if (result === null) throw Error('DO_NOT_PRINT_SENTINEL'); return result;
    }, policy), /^Error: PREVIEW_SCHEMA_POOL_READ_FAILED_STOP_NO_RETRY$/);
    assert.equal(calls, 1);
  }
});

test('an unowned, foreign, deleting or unreconciled job cannot be adopted', () => {
  for (const mutate of [
    j => { delete j.metadata.labels['khedmah-schema-pool']; },
    j => { j.metadata.labels['khedmah-schema-stage'] = 'billing-030-033'; },
    j => { j.metadata.namespace = '999'; }, j => { j.metadata.uid = ''; },
    j => { j.metadata.deletionTimestamp = '2026-10-11T12:00:00Z'; },
    j => { j.status.observedGeneration = 1; }, j => { j.status.conditions[0].status = 'Unknown'; },
    j => { j.spec.template.spec.template.spec.serviceAccountName = 'foreign'; },
    j => { j.spec.template.metadata.annotations['run.googleapis.com/cloudsql-instances'] = 'foreign'; },
  ]) {
    const f = fixture(); mutate(f.job); assert.throws(() => f.check(), /OWNERSHIP_OR_RECONCILIATION_REJECTED/);
    assert.equal(f.calls.length, 2);
  }
});

test('an earlier running execution blocks reuse even when the latest succeeded', () => {
  for (const mutate of [e => { delete e.status.completionTime; }, e => { e.status.runningCount = 1; },
    e => { e.status.conditions[0].status = 'Unknown'; }, e => { delete e.status.conditions; }]) {
    const f = fixture(); mutate(f.executions[0]); assert.throws(() => f.check(), /ACTIVE_OR_UNVERIFIED_EXECUTION/);
  }
});

test('failed terminal executions allow retry; missing, foreign, duplicated or truncated history does not', () => {
  const f = fixture(); f.executions[0].status.conditions[0].status = 'False';
  assert.equal(f.check(), name);
  for (const mutate of [
    f => { f.executions = []; }, f => { f.executions.pop(); },
    f => { f.executions[0].metadata.namespace = '999'; },
    f => { f.executions = [f.executions[0], f.executions[0]]; },
    f => { f.executions = Array(1001).fill(f.executions[0]); },
  ]) { const bad = fixture(); mutate(bad); assert.throws(() => bad.check()); }
});

test('a never-executed owned job is reusable and retained history need not equal its lifetime count', () => {
  const fresh = fixture(); fresh.executions = []; fresh.job.status.executionCount = 0; delete fresh.job.status.latestCreatedExecution;
  assert.equal(fresh.check('before-execute'), name);
  const old = fixture(); old.job.status.executionCount = 2000;
  assert.equal(old.check(), name);
});

test('post-deploy check requires this exact revision image before executing', () => {
  const f = fixture();
  f.job.spec.template.spec.template.spec.containers[0].image = f.job.spec.template.spec.template.spec.containers[0].image.replace(identifier, 'pr-200-' + 'b'.repeat(40));
  assert.equal(f.check('before-deploy'), name);
  assert.throws(() => f.check('before-execute'), /IMAGE_REJECTED/);
  f.job.spec.template.spec.template.spec.containers[0].image = 'foreign/image:preview-' + identifier;
  assert.throws(() => f.check(), /IMAGE_REJECTED/);
});

test('all nine helpers guard deploy and execution while preserving image revisions and Staging labels', () => {
  const root = new URL('../scripts/deployment/', import.meta.url);
  const files = readdirSync(root).filter(p => /^ensure-.*nonproduction-schema\.sh$/.test(p));
  assert.equal(files.length, 9);
  for (const p of files) {
    const s = readFileSync(new URL(p, root), 'utf8');
    assert.ok(s.indexOf('preview-schema-job-pool.mjs name') < s.indexOf('gcloud builds submit'));
    assert.ok(s.indexOf('preview-schema-job-pool.mjs before-deploy') < s.indexOf('gcloud run jobs deploy'));
    assert.ok(s.indexOf('preview-schema-job-pool.mjs before-execute') > s.indexOf('gcloud run jobs deploy'));
    assert.ok(s.indexOf('preview-schema-job-pool.mjs before-execute') < s.indexOf('gcloud run jobs execute'));
    assert.match(s, /pool_label_args=\(\)\nif \[\[ "\$environment" == 'preview' \]\]; then/);
    assert.match(s, /gcloud run jobs deploy "\$job" "\$\{pool_label_args\[@\]\}"/);
    assert.ok(s.includes('${tag}')); assert.ok(!s.includes('short_identifier'));
  }
});

const sourceEnv = { PREVIEW_PR_NUMBER: '274', PREVIEW_HEAD_SHA: 'a'.repeat(40), PREVIEW_EXPECTED_PR_STATE: 'open' };

function replacementFixture() {
  const project = 'khedmah-preview-v2-20261012';
  const replacementPolicy = { project_sha256: hash(project), namespace: '1044962071847', region: policy.region };
  const replacementEnv = { ...env, GOOGLE_CLOUD_PROJECT: project, ARTIFACT_REPOSITORY: 'khedmah-preview',
    RUNTIME_SERVICE_ACCOUNT: 'khedmah-pv2-runtime@' + project + '.iam.gserviceaccount.com',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: project + ':europe-west1:khedmah-preview-v2-db' };
  const job = fixture().job;
  job.metadata.namespace = replacementPolicy.namespace;
  job.status.executionCount = 0;
  delete job.status.latestCreatedExecution;
  job.spec.template.metadata.annotations['run.googleapis.com/cloudsql-instances'] = replacementEnv.CLOUD_SQL_INSTANCE_CONNECTION_NAME;
  const spec = job.spec.template.spec.template.spec;
  spec.serviceAccountName = 'khedmah-pv2-migrator@' + project + '.iam.gserviceaccount.com';
  spec.containers[0].image = policy.region + '-docker.pkg.dev/' + project + '/khedmah-preview/classifieds-migration:preview-' + identifier;
  spec.containers[0].env = [{ name: 'DATABASE_URL', valueFrom: { secretKeyRef: { name: 'DATABASE_MIGRATION_URL', key: '1' } } }];
  const run = (command, args) => {
    assert.equal(command, 'gcloud');
    assert.ok(args.includes('--project=' + project));
    if (args[2] === 'list') return JSON.stringify([{ metadata: { name } }]);
    if (args[2] === 'describe') return JSON.stringify(job);
    if (args[2] === 'executions') return '[]';
    assert.fail('unexpected cloud operation');
  };
  return { spec, env: replacementEnv, check: () => checkSchemaJob(replacementEnv, 'preview', identifier,
    stage, 'before-execute', run, replacementPolicy) };
}

test('replacement job contract uses migration identity and the verified immutable credential version', () => {
  assert.equal(replacementFixture().check(), name);
  const f = replacementFixture(); f.spec.serviceAccountName = f.env.RUNTIME_SERVICE_ACCOUNT;
  assert.throws(() => f.check(), /OWNERSHIP_OR_RECONCILIATION_REJECTED/);
});

test('replacement job rejects runtime credentials, aliases, literal values, duplicates and missing binding', () => {
  for (const mutate of [
    s => { s.env[0].valueFrom.secretKeyRef.name = 'DATABASE_URL'; },
    s => { s.env[0].valueFrom.secretKeyRef.key = 'latest'; },
    s => { s.env[0].value = 'must-not-pass'; },
    s => { s.env.push(structuredClone(s.env[0])); },
    s => { s.env = []; },
  ]) {
    const f = replacementFixture(); mutate(f.spec.containers[0]);
    assert.throws(() => f.check(), /MIGRATION_SECRET_BINDING_REJECTED/);
  }
});

test('live policy selects only the replacement; the old project is rejected', () => {
  assert.doesNotThrow(() => validatePoolTarget(replacementFixture().env));
  assert.throws(() => validatePoolTarget({ ...replacementFixture().env, GOOGLE_CLOUD_PROJECT: 'khedmah-preview-774201339973' }), /TARGET_OR_SERIALIZATION_REJECTED/);
});

const pr = { number: 274, state: 'open', head_sha: sourceEnv.PREVIEW_HEAD_SHA, head_repo: 'khedma-sy/khedmah-digital-v1' };
test('queued deployment accepts only the latest same-repository open PR source', () => {
  assert.equal(verifyPreviewSource(sourceEnv, () => JSON.stringify(pr)), true);
  for (const changed of [{ ...pr, head_sha: 'b'.repeat(40) }, { ...pr, state: 'closed' }, { ...pr, head_repo: 'foreign/fork' }, { ...pr, number: 275 }]) {
    assert.throws(() => verifyPreviewSource(sourceEnv, () => JSON.stringify(changed)), /STALE_OR_FOREIGN/);
  }
});
test('closed cleanup checks fresh PR state and denies reopened requests or unreadable metadata', () => {
  const e = { ...sourceEnv, PREVIEW_EXPECTED_PR_STATE: 'closed' };
  assert.equal(verifyPreviewSource(e, () => JSON.stringify({ ...pr, state: 'closed' })), true);
  assert.throws(() => verifyPreviewSource(e, () => JSON.stringify(pr)), /STALE_OR_FOREIGN/);
  assert.throws(() => verifyPreviewSource(e, () => { throw Error('DO_NOT_PRINT_SENTINEL'); }), /^Error: PREVIEW_SOURCE_READ_FAILED$/);
  assert.throws(() => verifyPreviewSource({ ...e, PREVIEW_PR_NUMBER: '../bad' }, () => assert.fail('unexpected call')), /INPUT_REJECTED/);
});
test('both cloud writers share one non-cancelling queue; stale-source checks precede auth and pool preflight precedes rollout', () => {
  const s = readFileSync(new URL('../.github/workflows/preview-deployment.yml', import.meta.url), 'utf8');
  assert.equal((s.match(/group: khedmah-preview-cloud-mutations\n      queue: max\n      cancel-in-progress: false/g) ?? []).length, 2);
  assert.doesNotMatch(s, /cancel-in-progress: true/);
  for (const name of ['deploy-preview', 'cleanup-preview']) {
    const job = s.slice(s.indexOf('  ' + name + ':')).split(/\n  [a-z][a-z-]+:\n/)[0];
    assert.ok(job.indexOf('verify-preview-source.mjs') < job.indexOf('google-github-actions/auth@v3'));
  }
  const preflight = s.indexOf('PREVIEW_SCHEMA_POOL_READONLY_PREFLIGHT_PASSED');
  const approval = s.indexOf('PREVIEW_SCHEMA_POOL_ROLLOUT_APPROVED');
  assert.ok(preflight > s.indexOf('checkSchemaJob(process.env'));
  assert.ok(approval > preflight && approval < s.indexOf('name: Deploy isolated PR services'));
  assert.doesNotMatch(s, /PREVIEW_DIAGNOSTIC_COMPLETE_DEPLOYMENT_HELD/);
  assert.doesNotMatch(s, /preview-job-cleanup\.mjs/);
});
