import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cleanupPreviewJobs, confirmationFor } from '../scripts/deployment/preview-job-cleanup.mjs';
import { reviewPreviewCandidates } from '../scripts/deployment/preview-job-candidate-review.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const project = 'khedmah-preview-fixture';
  const env = { DEPLOYMENT_ENVIRONMENT: 'preview', PREVIEW_GOOGLE_CLOUD_PROJECT: project,
    PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', GOOGLE_CLOUD_REGION: 'europe-west1',
    PREVIEW_RUNTIME_SERVICE_ACCOUNT: 'runtime@' + project + '.iam.gserviceaccount.com' };
  const closed = '2026-09-18T21:00:00Z';
  const created = '2026-09-02T02:39:49.195660Z';
  const names = [12, 13].map(n => 'khedmah-pr-' + n + '-migration');
  const jobs = names.map((name, i) => ({
    metadata: { name, uid: String(i + 1).repeat(32), namespace: '123456789', creationTimestamp: created,
      labels: { 'cloud.googleapis.com/location': 'europe-west1' } },
    spec: { template: { spec: { template: { spec: {
      serviceAccountName: env.PREVIEW_RUNTIME_SERVICE_ACCOUNT,
      containers: [{ image: 'europe-west1-docker.pkg.dev/' + project + '/images/database-migrations:preview-pr-' + (i + 12) + '-' + 'a'.repeat(40) }],
    } } } } }, status: { executionCount: 1 },
  }));
  const executions = names.map(name => [{ metadata: { name: name + '-abc12', namespace: '123456789',
    creationTimestamp: created, labels: { 'run.googleapis.com/job': name } },
  status: { completionTime: '2026-09-02T02:45:00Z', conditions: [{ type: 'Completed', status: 'True' }] } }]);
  const calls = [], reads = new Map(), deleted = [];
  let intercept = () => undefined;
  const run = (command, args) => {
    calls.push({ command, args });
    const override = intercept(command, args, reads);
    if (override !== undefined) return override;
    if (command === 'gh') return JSON.stringify({ number: Number(args[1].split('/').at(-1)), state: 'closed', closed_at: closed });
    assert.equal(command, 'gcloud');
    assert.ok(args.includes('--project=' + project));
    assert.ok(args.includes('--region=europe-west1'));
    if (args[2] === 'describe') {
      const name = args[3]; reads.set(name, (reads.get(name) ?? 0) + 1);
      return JSON.stringify(jobs[names.indexOf(name)]);
    }
    if (args[2] === 'executions') return JSON.stringify(executions[names.indexOf(args.find(a => a.startsWith('--job=')).slice(6))]);
    if (args[2] === 'delete') {
      assert.ok(reads.get(args[3]) >= 2, 'delete requires fresh per-job read');
      deleted.push(args[3]); return '';
    }
    assert.equal(args[2], 'list'); return '[]';
  };
  const manifest = { schema: 1, project_sha256: hash(project), region: 'europe-west1',
    candidates: names.map(name => ({ name, created_at: created })) };
  const result = reviewPreviewCandidates(env, run, manifest);
  manifest.candidates = result.records.map(r => ({ name: r.name, uid: r.uid, namespace: r.namespace,
    created_at: r.created_at, image_sha256: hash(r.image), source_pr: r.source_pr,
    source_revision: r.source_revision, pr_closed_at: closed, lifetime_execution_count: 1,
    retained_execution_count: 1, executions_sha256: hash(JSON.stringify(r.executions)) }));
  calls.length = 0; reads.clear();
  return { env, run, manifest, calls, reads, deleted, jobs, executions, names,
    intercept: fn => { intercept = fn; } };
}

test('exact approval and Preview target guards reject before external calls', () => {
  const f = fixture();
  assert.throws(() => cleanupPreviewJobs(f.env, f.run, f.manifest, 'wrong'), /APPROVAL_REQUIRED/);
  assert.equal(f.calls.length, 0);
  for (const env of [{ ...f.env, PREVIEW_GOOGLE_CLOUD_PROJECT: 'khedma-dl' }, { ...f.env, GOOGLE_CLOUD_REGION: 'us-central1' }]) {
    assert.throws(() => cleanupPreviewJobs(env, f.run, f.manifest, confirmationFor(f.manifest)), /TARGET_REJECTED/);
  }
  assert.equal(f.calls.length, 0);
});

test('any changed preflight identity, image, execution or PR prevents all deletes', () => {
  for (const mutate of [
    f => { f.jobs[1].metadata.uid = 'f'.repeat(32); },
    f => { f.jobs[1].spec.template.spec.template.spec.containers[0].image += '-changed'; },
    f => { f.executions[1][0].status.conditions[0].status = 'Unknown'; },
    f => { f.jobs[1].status.executionCount = 2; },
    f => { f.intercept(command => command === 'gh' ? '{"number":12,"state":"open"}' : undefined); },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => cleanupPreviewJobs(f.env, f.run, f.manifest, confirmationFor(f.manifest)), /CHANGED/);
    assert.equal(f.calls.filter(c => c.args[2] === 'delete').length, 0);
  }
});

test('state drift after one completed delete stops the remaining batch', () => {
  const f = fixture();
  f.intercept((command, args, reads) => {
    if (args[2] === 'describe' && args[3] === f.names[1] && reads.get(f.names[1]) === 1) {
      const changed = structuredClone(f.jobs[1]); changed.metadata.uid = 'f'.repeat(32);
      return JSON.stringify(changed);
    }
  });
  assert.throws(() => cleanupPreviewJobs(f.env, f.run, f.manifest, confirmationFor(f.manifest)), /LIVE_STATE_CHANGED/);
  assert.deepEqual(f.deleted, [f.names[0]]);
});

test('a denied or unconfirmed delete stops without retry or raw error output', () => {
  const f = fixture();
  f.intercept((command, args) => { if (args[2] === 'delete') throw Error('DO_NOT_PRINT_SENTINEL'); });
  assert.throws(() => cleanupPreviewJobs(f.env, f.run, f.manifest, confirmationFor(f.manifest)),
    /^Error: PREVIEW_CLEANUP_DELETE_UNCONFIRMED_STOP_NO_RETRY$/);
  assert.equal(f.calls.filter(c => c.args[2] === 'delete').length, 1);
});

test('successful mocked cleanup reads all candidates first, refreshes each, and verifies absence', () => {
  const f = fixture(), events = [];
  const deleted = cleanupPreviewJobs(f.env, f.run, f.manifest, confirmationFor(f.manifest), e => events.push(e));
  assert.deepEqual(deleted, f.names);
  assert.equal(f.calls.at(-1).args[2], 'list');
  assert.equal(f.calls.filter(c => c.args[2] === 'describe').length, 4);
  assert.equal(f.calls.filter(c => c.command === 'gh').length, 4);
  assert.equal(events.filter(e => e.startsWith('STAGE_DONE=')).length, 2);
  assert.match(events.at(-1), /"deleted_count":2,"remaining_job_count":0/);
});

test('post-delete inventory denial or surviving candidates cannot report success', () => {
  for (const response of ['bad json', '[{"metadata":{"name":"khedmah-pr-12-migration"}}]']) {
    const f = fixture(), events = [];
    f.intercept((command, args) => args[2] === 'list' ? response : undefined);
    assert.throws(() => cleanupPreviewJobs(f.env, f.run, f.manifest, confirmationFor(f.manifest), e => events.push(e)), /POST_READ/);
    assert.ok(!events.some(e => e.startsWith('PREVIEW_CLEANUP_VERIFIED=')));
  }
});

test('the deployed workflow still invokes only the read and deployment hold', () => {
  const workflow = readFileSync(new URL('../.github/workflows/preview-deployment.yml', import.meta.url), 'utf8');
  assert.ok(!workflow.includes('preview-job-cleanup.mjs'));
  assert.ok(workflow.includes('node scripts/deployment/preview-job-candidate-review.mjs'));
  assert.ok(workflow.includes('PREVIEW_DIAGNOSTIC_COMPLETE_DEPLOYMENT_HELD'));
});
