import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryPreviewJobs } from '../scripts/deployment/preview-job-inventory.mjs';

const env = {
  DEPLOYMENT_ENVIRONMENT: 'preview',
  PREVIEW_GOOGLE_CLOUD_PROJECT: 'khedmah-preview-774201339973',
  GOOGLE_CLOUD_REGION: 'europe-west1',
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl',
};
const job = (name = 'khedmah-preview-test-001', timestamp = '2026-10-01T12:00:00Z') => ({
  metadata: { name, creationTimestamp: timestamp, labels: { component: 'foundation' } },
  spec: { secret_value: 'DO_NOT_PRINT_SENTINEL' },
  status: { unreviewed: true },
});

test('only reads projected metadata from the pinned Preview project', () => {
  const calls = [];
  const result = inventoryPreviewJobs(env, (command, args, options) => {
    calls.push({ command, args, options });
    return JSON.stringify([job()]);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'gcloud');
  assert.deepEqual(calls[0].args, [
    'run', 'jobs', 'list', '--project=khedmah-preview-774201339973',
    '--region=europe-west1', '--limit=2000', '--user-output-enabled',
    '--format=json(metadata.name,metadata.creationTimestamp,metadata.labels)',
  ]);
  assert.equal(calls[0].options.env.CLOUDSDK_CORE_LOG_HTTP, 'false');
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(result.job_count, 1);
  assert.equal(result.execution_state_reviewed, false);
  assert.equal(result.cleanup_authorized, false);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT_SENTINEL'));
  assert.ok(!JSON.stringify(result).includes('unreviewed'));
});

test('rejects missing or changed target configuration before any cloud call', () => {
  for (const key of Object.keys(env)) {
    for (const value of ['', 'khedma-dl', 'unapproved-value']) {
      if (value === env[key]) continue;
      assert.throws(() => inventoryPreviewJobs({ ...env, [key]: value }, () => {
        assert.fail('Unexpected cloud call');
      }), /TARGET_REJECTED/);
    }
  }
});

test('denied and malformed reads fail with a safe error and no retry', () => {
  for (const response of [null, 'DO_NOT_PRINT_SENTINEL']) {
    let count = 0;
    assert.throws(() => inventoryPreviewJobs(env, () => {
      count++;
      if (response === null) throw new Error('DO_NOT_PRINT_SENTINEL');
      return response;
    }), /^Error: PREVIEW_INVENTORY_READ_FAILED$/);
    assert.equal(count, 1);
  }
});

test('empty inventory is a valid read, but an incomplete or invalid result is rejected', () => {
  assert.equal(inventoryPreviewJobs(env, () => '[]').job_count, 0);
  assert.equal(inventoryPreviewJobs(env, () => JSON.stringify([job('a')])).job_count, 1);
  for (const value of [{}, null, Array(2000).fill(job())]) {
    assert.throws(() => inventoryPreviewJobs(env, () => JSON.stringify(value)), /INCOMPLETE/);
  }
});

test('validates every record and rejects duplicate names or malformed metadata', () => {
  for (const values of [
    [job(), job()], [null], [{ metadata: { name: 'invalid;name' } }],
    [job('valid-job', 'not-a-date')],
    [{ ...job(), metadata: { ...job().metadata, labels: [] } }],
    [{ ...job(), metadata: { ...job().metadata, labels: { key: { value: 'bad' } } } }],
  ]) {
    assert.throws(() => inventoryPreviewJobs(env, () => JSON.stringify(values)), /METADATA_INVALID/);
  }
});

test('counts all jobs but returns only the oldest twenty in stable order', () => {
  const values = Array.from({ length: 25 }, (_, i) => job(
    'job-' + String(i).padStart(2, '0'),
    '2026-10-' + String(i + 1).padStart(2, '0') + 'T12:00:00Z',
  )).reverse();
  const result = inventoryPreviewJobs(env, () => JSON.stringify(values));
  assert.equal(result.job_count, 25);
  assert.equal(result.oldest_jobs.length, 20);
  assert.equal(result.oldest_jobs[0].name, 'job-00');
  assert.equal(result.oldest_jobs.at(-1).name, 'job-19');
});
