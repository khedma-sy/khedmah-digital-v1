import test from 'node:test';
import assert from 'node:assert/strict';
import { selectClosedPreviewJobCandidates } from '../scripts/deployment/plan-closed-preview-job-cleanup.mjs';

const scope = { project: 'preview-test-project', region: 'europe-west1' };
const image = (pr, sha = 'a'.repeat(40)) =>
  `europe-west1-docker.pkg.dev/${scope.project}/khedmah-preview/database-migrations:preview-pr-${pr}-${sha}`;
const job = (name, pr, {
  executionCount = 1,
  completionStatus = 'EXECUTION_SUCCEEDED',
  imageUrl = image(pr),
  extraImages = [],
  reconciling = false
} = {}) => ({
  name: `projects/${scope.project}/locations/${scope.region}/jobs/${name}`,
  executionCount,
  latestCreatedExecution: completionStatus ? { completionStatus } : undefined,
  reconciling,
  template: { template: { containers: [imageUrl, ...extraImages].map(value => ({ image: value })) } }
});

test('only terminal preview jobs for closed PRs are cleanup candidates', () => {
  const jobs = [
    job('khedmah-preview-food-promotions-034-abc', 214),
    job('khedmah-pr-205-migration', 205, { completionStatus: 'EXECUTION_FAILED' }),
    job('khedmah-preview-cancelled', 217, { completionStatus: 'EXECUTION_CANCELLED' }),
    job('khedmah-preview-never-ran', 216, { executionCount: 0, completionStatus: null }),
    job('khedmah-preview-current', 220),
    job('khedmah-preview-active', 201, { completionStatus: null }),
    job('khedmah-preview-reconciling', 218, { reconciling: true }),
    job('khedmah-preview-reconciling-unknown', 219, { reconciling: null }),
    job('khedmah-preview-multiple-runs', 202, { executionCount: 2 }),
    job('khedmah-preview-mixed-container', 211, { extraImages: ['docker.io/library/busybox:latest'] }),
    job('khedmah-preview-wrong-project', 207, { imageUrl: image(207).replace(scope.project, 'other-project') }),
    job('khedmah-staging-wrong-name', 208, { imageUrl: image(208) }),
    job('khedmah-preview-wrong-tag', 209, { imageUrl: image(209, 'not-a-sha') }),
    job('khedmah-preview-unrelated-repo', 210, { imageUrl: image(210).replace('/khedmah-preview/', '/other-repo/') })
  ];

  assert.deepEqual(
    selectClosedPreviewJobCandidates(jobs, new Set([201, 202, 205, 207, 208, 209, 210, 211, 214, 216, 217, 218, 219]), scope),
    [
      { name: 'khedmah-pr-205-migration', pullRequest: 205 },
      { name: 'khedmah-preview-cancelled', pullRequest: 217 },
      { name: 'khedmah-preview-food-promotions-034-abc', pullRequest: 214 }
    ]
  );
});

test('an open PR preview job is preserved', () => {
  const jobs = [
    job('khedmah-pr-172-migration', 172),
    job('khedmah-preview-current-pr', 220)
  ];
  assert.deepEqual(selectClosedPreviewJobCandidates(jobs, new Set(), scope), []);
});

test('unknown execution state fails closed', () => {
  const jobs = [
    job('khedmah-preview-unknown', 214, { completionStatus: 'EXECUTION_COMPLETION_STATUS_UNSPECIFIED' }),
    job('khedmah-preview-missing-count', 215, { executionCount: null })
  ];
  assert.deepEqual(selectClosedPreviewJobCandidates(jobs, new Set([214, 215]), scope), []);
});

test('malformed inventory fails closed', () => {
  assert.throws(() => selectClosedPreviewJobCandidates({}, new Set([220]), scope), /inventory must be an array/);
});

test('cleanup candidate limit bounds Cloud Run write requests', () => {
  const jobs = [
    job('khedmah-preview-first', 214),
    job('khedmah-preview-second', 215),
    job('khedmah-preview-third', 216)
  ];
  assert.deepEqual(
    selectClosedPreviewJobCandidates(jobs, new Set([214, 215, 216]), { ...scope, maxCandidates: 2 }),
    [
      { name: 'khedmah-preview-first', pullRequest: 214 },
      { name: 'khedmah-preview-second', pullRequest: 215 }
    ]
  );
  assert.throws(
    () => selectClosedPreviewJobCandidates(jobs, new Set([214]), { ...scope, maxCandidates: -1 }),
    /candidate limit/
  );
  assert.throws(
    () => selectClosedPreviewJobCandidates(jobs, new Set([214, 215, 216]), { ...scope, maxCandidates: 21 }),
    /candidate limit/
  );
});

test('default cleanup batch is hard-capped at twenty candidates', () => {
  const jobs = Array.from({ length: 21 }, (_, index) =>
    job(`khedmah-preview-batch-${String(index + 1).padStart(2, '0')}`, index + 1)
  );
  const closed = new Set(Array.from({ length: 21 }, (_, index) => index + 1));
  assert.equal(selectClosedPreviewJobCandidates(jobs, closed, scope).length, 20);
});
