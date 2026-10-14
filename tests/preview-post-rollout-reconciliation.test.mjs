import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIAGNOSTIC_HEAD, DIAGNOSTIC_JOB_ID, DIAGNOSTIC_RUN_ID,
  ENVIRONMENT_FAILURE_HEAD, ENVIRONMENT_FAILURE_JOB_ID, ENVIRONMENT_FAILURE_RUN_ID,
  ENVIRONMENT_DIAGNOSTIC_HEAD, ENVIRONMENT_DIAGNOSTIC_JOB_ID, ENVIRONMENT_DIAGNOSTIC_RUN_ID,
  FAILED_RECONCILIATION_HEAD, FAILED_RECONCILIATION_JOB_ID, FAILED_RECONCILIATION_RUN_ID,
  RECONCILIATION_MESSAGE, RECONCILIATION_PARENT, REVIEWED_MAIN,
  ROLLOUT_DEPLOY_JOB_ID, ROLLOUT_MERGE, ROLLOUT_RUN_ID, ROLLOUT_SOURCE,
  ROLLOUT_SOURCE_PARENT, verifyPostRolloutSource,
} from '../scripts/deployment/verify-preview-post-rollout-reconciliation.mjs';
import {
  BUILDS, JOBS, PROJECT, PROJECT_NUMBER, REGION, ROLLOUT_TAG, SERVICES,
  diagnoseBuildContract, diagnoseEnvironmentContract, readPostRolloutReconciliation,
} from '../scripts/deployment/read-preview-post-rollout-reconciliation.mjs';

const repo = 'khedma-sy/khedmah-digital-v1';
const head = 'a'.repeat(40);
const sourceEnv = {
  GITHUB_REPOSITORY: repo, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/274/merge',
  PREVIEW_EVENT_ACTION: 'synchronize', GITHUB_RUN_ATTEMPT: '1', PREVIEW_PR_NUMBER: '274',
  PREVIEW_HEAD_SHA: head,
};
const sourceResponses = () => [
  { sha: head, parents: [{ sha: RECONCILIATION_PARENT }], message: RECONCILIATION_MESSAGE },
  { number: 274, state: 'open', merged: false, head: { sha: head, repo: { full_name: repo } },
    base: { ref: 'main', repo: { full_name: repo } } },
  { commit: { sha: REVIEWED_MAIN } },
  { sha: ROLLOUT_SOURCE, parents: [{ sha: ROLLOUT_SOURCE_PARENT }],
    message: 'release(preview): execute reviewed rollout after source grant' },
  { sha: ROLLOUT_MERGE, parents: [{ sha: REVIEWED_MAIN }, { sha: ROLLOUT_SOURCE }],
    message: `Merge ${ROLLOUT_SOURCE} into ${REVIEWED_MAIN}` },
  { id: ROLLOUT_RUN_ID, name: 'PR Preview', event: 'pull_request', status: 'completed',
    conclusion: 'failure', run_attempt: 1, head_sha: ROLLOUT_SOURCE,
    path: '.github/workflows/preview-deployment.yml', head_repository: { full_name: repo },
    pull_requests: [{ number: 274, head: { sha: RECONCILIATION_PARENT } }] },
  { id: ROLLOUT_DEPLOY_JOB_ID, run_id: ROLLOUT_RUN_ID, name: 'deploy-preview',
    status: 'completed', conclusion: 'success', steps: [
      { name: 'Deploy isolated PR services', status: 'completed', conclusion: 'success' },
    ] },
  { id: FAILED_RECONCILIATION_RUN_ID, name: 'PR Preview', event: 'pull_request',
    status: 'completed', conclusion: 'failure', run_attempt: 1, head_sha: FAILED_RECONCILIATION_HEAD,
    path: '.github/workflows/preview-deployment.yml', head_repository: { full_name: repo },
    pull_requests: [{ number: 274 }] },
  { id: FAILED_RECONCILIATION_JOB_ID, run_id: FAILED_RECONCILIATION_RUN_ID,
    name: 'reconcile-successful-rollout', status: 'completed', conclusion: 'failure', steps: [
      { name: 'Verify the exact post-rollout reconciliation source before authentication', conclusion: 'success' },
      { name: 'Run google-github-actions/auth@v3', conclusion: 'success' },
      { name: 'Read exact successful Preview rollout metadata and anonymous HTTP', conclusion: 'failure' },
    ] },
  { id: DIAGNOSTIC_RUN_ID, name: 'PR Preview', event: 'pull_request',
    status: 'completed', conclusion: 'failure', run_attempt: 1, head_sha: DIAGNOSTIC_HEAD,
    path: '.github/workflows/preview-deployment.yml', head_repository: { full_name: repo },
    pull_requests: [{ number: 274 }] },
  { id: DIAGNOSTIC_JOB_ID, run_id: DIAGNOSTIC_RUN_ID,
    name: 'reconcile-successful-rollout', status: 'completed', conclusion: 'success', steps: [
      { name: 'Read bounded Preview rollout Build metadata after held mismatch',
        status: 'completed', conclusion: 'success' },
    ] },
  { id: ENVIRONMENT_FAILURE_RUN_ID, name: 'PR Preview', event: 'pull_request',
    status: 'completed', conclusion: 'failure', run_attempt: 1,
    head_sha: ENVIRONMENT_FAILURE_HEAD, path: '.github/workflows/preview-deployment.yml',
    head_repository: { full_name: repo }, pull_requests: [{ number: 274 }] },
  { id: ENVIRONMENT_FAILURE_JOB_ID, run_id: ENVIRONMENT_FAILURE_RUN_ID,
    name: 'reconcile-successful-rollout', status: 'completed', conclusion: 'failure', steps: [
      { name: 'Read exact successful Preview rollout metadata and anonymous HTTP',
        status: 'completed', conclusion: 'failure' },
    ] },
  { id: ENVIRONMENT_DIAGNOSTIC_RUN_ID, name: 'PR Preview', event: 'pull_request',
    status: 'completed', conclusion: 'failure', run_attempt: 1,
    head_sha: ENVIRONMENT_DIAGNOSTIC_HEAD, path: '.github/workflows/preview-deployment.yml',
    head_repository: { full_name: repo }, pull_requests: [{ number: 274 }] },
  { id: ENVIRONMENT_DIAGNOSTIC_JOB_ID, run_id: ENVIRONMENT_DIAGNOSTIC_RUN_ID,
    name: 'reconcile-successful-rollout', status: 'completed', conclusion: 'failure', steps: [
      { name: 'Read bounded Preview rollout environment metadata after held mismatch',
        status: 'completed', conclusion: 'failure' },
    ] },
];

function githubRunner(responses = sourceResponses(), calls = []) {
  return (tool, args, options) => {
    calls.push(args);
    assert.equal(tool, 'gh');
    assert.deepEqual(args.slice(0, 3), ['api', '--hostname', 'github.com']);
    assert.ok(!args.includes('--method'));
    assert.equal(options.timeout, 30000);
    return JSON.stringify(responses.shift());
  };
}

test('source gate performs exactly fifteen GETs and binds all prior read-only receipts', () => {
  const calls = [];
  const receipt = verifyPostRolloutSource(sourceEnv, githubRunner(sourceResponses(), calls));
  assert.equal(calls.length, 15);
  assert.deepEqual(calls.map(args => args[3]), [
    `repos/${repo}/git/commits/${head}`, `repos/${repo}/pulls/274`, `repos/${repo}/branches/main`,
    `repos/${repo}/git/commits/${ROLLOUT_SOURCE}`, `repos/${repo}/git/commits/${ROLLOUT_MERGE}`,
    `repos/${repo}/actions/runs/${ROLLOUT_RUN_ID}`, `repos/${repo}/actions/jobs/${ROLLOUT_DEPLOY_JOB_ID}`,
    `repos/${repo}/actions/runs/${FAILED_RECONCILIATION_RUN_ID}`,
    `repos/${repo}/actions/jobs/${FAILED_RECONCILIATION_JOB_ID}`,
    `repos/${repo}/actions/runs/${DIAGNOSTIC_RUN_ID}`,
    `repos/${repo}/actions/jobs/${DIAGNOSTIC_JOB_ID}`,
    `repos/${repo}/actions/runs/${ENVIRONMENT_FAILURE_RUN_ID}`,
    `repos/${repo}/actions/jobs/${ENVIRONMENT_FAILURE_JOB_ID}`,
    `repos/${repo}/actions/runs/${ENVIRONMENT_DIAGNOSTIC_RUN_ID}`,
    `repos/${repo}/actions/jobs/${ENVIRONMENT_DIAGNOSTIC_JOB_ID}`,
  ]);
  assert.equal(receipt.rollout_run_conclusion, 'failure');
  assert.equal(receipt.rollout_deploy_job_conclusion, 'success');
  for (const key of ['rollout_retry_authorized', 'cleanup_authorized',
    'production_access_authorized', 'cloud_mutation']) assert.equal(receipt[key], false);
});

test('source gate rejects reruns, reopen/forks, changed main, alternate lineage and falsified old receipts before WIF', () => {
  for (const patch of [{ GITHUB_RUN_ATTEMPT: '2' }, { PREVIEW_EVENT_ACTION: 'reopened' },
    { PREVIEW_PR_NUMBER: '275' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_REPOSITORY: 'fork/repo' }]) {
    assert.throws(() => verifyPostRolloutSource({ ...sourceEnv, ...patch }, () => assert.fail('read')));
  }
  for (const [index, mutate] of [
    [0, value => { value.parents[0].sha = ROLLOUT_SOURCE; }],
    [1, value => { value.head.repo.full_name = 'fork/repo'; }],
    [2, value => { value.commit.sha = head; }],
    [3, value => { value.parents = []; }],
    [4, value => { value.parents.reverse(); }],
    [5, value => { value.conclusion = 'success'; }],
    [5, value => { value.head_sha = ROLLOUT_MERGE; }],
    [6, value => { value.conclusion = 'failure'; }],
    [6, value => { value.steps[0].conclusion = 'failure'; }],
    [7, value => { value.head_sha = head; }],
    [8, value => { value.steps[2].conclusion = 'success'; }],
    [9, value => { value.conclusion = 'success'; }],
    [9, value => { value.head_sha = head; }],
    [10, value => { value.conclusion = 'failure'; }],
    [10, value => { value.steps[0].conclusion = 'failure'; }],
    [11, value => { value.conclusion = 'success'; }],
    [11, value => { value.head_sha = head; }],
    [12, value => { value.conclusion = 'success'; }],
    [12, value => { value.steps[0].conclusion = 'success'; }],
    [13, value => { value.conclusion = 'success'; }],
    [13, value => { value.head_sha = head; }],
    [14, value => { value.conclusion = 'success'; }],
    [14, value => { value.steps[0].conclusion = 'success'; }],
  ]) {
    const responses = sourceResponses(); mutate(responses[index]);
    assert.throws(() => verifyPostRolloutSource(sourceEnv, githubRunner(responses)));
  }
});

test('source gate holds unreadable/malformed provider data without exposing it or retrying', () => {
  let calls = 0;
  assert.throws(() => verifyPostRolloutSource(sourceEnv, () => {
    calls += 1; throw new Error('TOKEN_DO_NOT_PRINT');
  }), /^Error: PREVIEW_POST_ROLLOUT_SOURCE_GITHUB_READ_HELD$/);
  assert.equal(calls, 1);
  assert.throws(() => verifyPostRolloutSource(sourceEnv, () => '{bad'),
    /^Error: PREVIEW_POST_ROLLOUT_SOURCE_GITHUB_READ_HELD$/);
});

const credential = '/tmp/gha-creds-fixture.json';
const cloudEnv = {
  ...sourceEnv, GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'PR Preview',
  PREVIEW_GOOGLE_CLOUD_PROJECT: PROJECT, GOOGLE_CLOUD_REGION: REGION,
  PREVIEW_ARTIFACT_REPOSITORY: 'khedmah-preview',
  PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME: `${PROJECT}:${REGION}:khedmah-preview-v2-db`,
  PREVIEW_V2_DEPLOYER_SERVICE_ACCOUNT: `khedmah-pv2-deployer@${PROJECT}.iam.gserviceaccount.com`,
  PREVIEW_V2_RUNTIME_SERVICE_ACCOUNT: `khedmah-pv2-runtime@${PROJECT}.iam.gserviceaccount.com`,
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_FIREBASE_PROJECT_ID: 'khedma-dl',
  GOOGLE_GHA_CREDS_PATH: credential, CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: credential,
};

const plain = (name, value) => ({ name, value });
const secret = (name, target, key) => ({ name,
  valueFrom: { secretKeyRef: { name: target, key } } });
function serviceFixture(expected) {
  const common = [plain('NODE_ENV', 'preview'), plain('APP_VERSION', ROLLOUT_TAG),
    plain('TAXI_TRIPS_ENABLED', 'false')];
  const env = expected.component === 'frontend' ? common : [...common,
    plain('CLOUD_SQL_INSTANCE_CONNECTION_NAME', `${PROJECT}:${REGION}:khedmah-preview-v2-db`),
    plain('CLASSIFIEDS_ENABLED', 'true'), plain('TAXI_ACCESS_ENABLED', 'true'),
    plain('GCS_MEDIA_BUCKET', `${PROJECT}.firebasestorage.app`),
    plain('EMAIL_FROM', 'noreply@mail.khedmah.uk'), plain('CORS_ORIGIN', SERVICES[1].statusUrl),
    plain('NEXT_PUBLIC_SITE_URL', SERVICES[1].statusUrl),
    secret('DATABASE_URL', 'DATABASE_URL', '1'), secret('FIREBASE_API_KEY', 'FIREBASE_API_KEY', '1'),
    secret('RESEND_API_KEY', 'RESEND_API_KEY', 'latest')];
  return { metadata: { name: expected.name, namespace: PROJECT_NUMBER, generation: 2,
    labels: { 'cloud.googleapis.com/location': REGION } }, spec: { template: {
    metadata: { annotations: expected.component === 'backend'
      ? { 'run.googleapis.com/cloudsql-instances': `${PROJECT}:${REGION}:khedmah-preview-v2-db` } : {} },
    spec: { serviceAccountName: expected.identity, containers: [{ image: expected.image, env }] },
  } }, status: { observedGeneration: 2, conditions: [{ type: 'Ready', status: 'True' }],
    latestCreatedRevisionName: expected.revision, latestReadyRevisionName: expected.revision,
    url: expected.statusUrl, traffic: [{ revisionName: expected.revision, percent: 100 }] } };
}

function jobFixture(expected) {
  const env = [plain('DEPLOYMENT_ENVIRONMENT', 'preview'), plain('GOOGLE_CLOUD_PROJECT', PROJECT),
    plain('PRODUCTION_GOOGLE_CLOUD_PROJECT', 'khedma-dl'),
    plain('CLOUD_SQL_INSTANCE_CONNECTION_NAME', `${PROJECT}:${REGION}:khedmah-preview-v2-db`),
    plain('MIGRATION_MODE', 'verify'), secret('DATABASE_URL', 'DATABASE_MIGRATION_URL', '1'),
    ...Object.entries(expected.stageEnv).map(([name, value]) => plain(name, value))];
  return { metadata: { name: expected.name, namespace: PROJECT_NUMBER, generation: 1,
    labels: { 'cloud.googleapis.com/location': REGION, 'khedmah-schema-pool': 'bounded-v1',
      'khedmah-schema-stage': expected.stage } }, spec: { template: {
    metadata: { annotations: { 'run.googleapis.com/cloudsql-instances': `${PROJECT}:${REGION}:khedmah-preview-v2-db` } },
    spec: { taskCount: 1, parallelism: 1, template: { spec: { maxRetries: 0,
      timeoutSeconds: expected.timeoutSeconds,
      serviceAccountName: `khedmah-pv2-migrator@${PROJECT}.iam.gserviceaccount.com`,
      containers: [{ image: expected.image, env }] } } },
  } }, status: { observedGeneration: 1, conditions: [{ type: 'Ready', status: 'True' }],
    executionCount: 1, latestCreatedExecution: { name: expected.execution } } };
}

function executionFixture(expected) {
  return { metadata: { name: expected.execution, namespace: PROJECT_NUMBER,
    labels: { 'run.googleapis.com/job': expected.name } }, status: {
    startTime: '2026-10-14T17:00:00Z', completionTime: '2026-10-14T17:01:00Z',
    succeededCount: 1, retriedCount: 0, conditions: [{ type: 'Completed', status: 'True' }],
  } };
}

function cloudFixture(change = value => value) {
  const calls = [];
  const run = (tool, args, options) => {
    calls.push({ tool, args, options });
    if (tool === 'curl') {
      const url = args.at(-1);
      assert.ok(SERVICES.some(service => url.startsWith(service.statusUrl)));
      assert.ok(args.includes('--proto') && args.includes('=https'));
      assert.ok(!args.includes('--data') && !args.includes('--upload-file'));
      const preflight = args.includes('OPTIONS');
      const raw = preflight
        ? `HTTP/2 204\r\naccess-control-allow-origin: ${SERVICES[1].statusUrl}\r\naccess-control-allow-credentials: true\r\naccess-control-allow-methods: GET,POST,OPTIONS\r\n\r\n\nKHEDMAH_HTTP_STATUS=204\n`
        : '\nKHEDMAH_HTTP_STATUS=200\n';
      return change(raw, { tool, args });
    }
    assert.equal(tool, 'gcloud');
    assert.ok(args.includes('--project=' + PROJECT));
    assert.ok(args.some(arg => arg.startsWith('--format=json(')));
    assert.doesNotMatch(args.join(' '), /\b(?:submit|deploy|execute|delete|update|create|add-iam|set-iam|versions access|logging read|storage objects)\b/);
    let value;
    if (args[0] === 'projects') value = { projectId: PROJECT, projectNumber: PROJECT_NUMBER, lifecycleState: 'ACTIVE' };
    else if (args[0] === 'builds' && args[1] === 'list') {
      value = BUILDS.map(expected => ({ id: expected.id, status: 'SUCCESS',
        substitutions: { _IMAGE_TAG: ROLLOUT_TAG } }));
    } else if (args[0] === 'builds' && args[1] === 'describe') {
      const expected = BUILDS.find(item => item.id === args[2]);
      assert.ok(expected);
      value = { id: expected.id, projectId: PROJECT,
        name: `projects/${PROJECT_NUMBER}/locations/${REGION}/builds/${expected.id}`, status: 'SUCCESS',
        serviceAccount: `projects/${PROJECT}/serviceAccounts/khedmah-pv2-build@${PROJECT}.iam.gserviceaccount.com`,
        substitutions: { _IMAGE_TAG: ROLLOUT_TAG, _REGION: REGION, _REPOSITORY: 'khedmah-preview' },
        source: { storageSource: { bucket: PROJECT + '-cloudbuild-source', object: expected.sourceObject } },
        sourceProvenance: { resolvedStorageSource: { bucket: PROJECT + '-cloudbuild-source',
          object: expected.sourceObject, generation: '123456' } }, results: { images: [{ name: expected.image,
          digest: 'sha256:' + 'b'.repeat(64) }] } };
      if (expected.component === 'frontend') Object.assign(value.substitutions, {
        _NEXT_PUBLIC_API_URL: SERVICES[0].statusUrl, _NEXT_PUBLIC_CLASSIFIEDS_ENABLED: 'true' });
    } else if (args[0] === 'run' && args[1] === 'services' && args[2] === 'list') {
      value = SERVICES.map(expected => ({ metadata: { name: expected.name, namespace: PROJECT_NUMBER,
        labels: { 'cloud.googleapis.com/location': REGION } } }));
    } else if (args[0] === 'run' && args[1] === 'services' && args[2] === 'describe') {
      const expected = SERVICES.find(item => item.name === args[3]); assert.ok(expected);
      value = serviceFixture(expected);
    } else if (args[0] === 'run' && args[1] === 'jobs' && args[2] === 'list') {
      value = JOBS.map(expected => ({ metadata: { name: expected.name, namespace: PROJECT_NUMBER,
        labels: { 'cloud.googleapis.com/location': REGION } } }));
    } else if (args[0] === 'run' && args[1] === 'jobs' && args[2] === 'describe') {
      const expected = JOBS.find(item => item.name === args[3]); assert.ok(expected);
      value = jobFixture(expected);
    } else if (args.slice(0, 4).join(' ') === 'run jobs executions describe') {
      const expected = JOBS.find(item => item.execution === args[4]); assert.ok(expected);
      value = executionFixture(expected);
    } else assert.fail('unexpected metadata command ' + args.join(' '));
    return JSON.stringify(change(structuredClone(value), { tool, args }));
  };
  return { run, calls };
}

test('reader verifies exactly eleven builds, two v1 services, nine jobs/executions and short-origin HTTP/CORS without mutation', () => {
  const fixture = cloudFixture();
  const receipt = readPostRolloutReconciliation(cloudEnv, fixture.run);
  assert.equal(receipt.build_count, 11); assert.equal(receipt.service_count, 2); assert.equal(receipt.job_count, 9);
  assert.equal(receipt.exact_rollout_resources_verified, true);
  assert.equal(fixture.calls.filter(call => call.tool === 'gcloud').length, 35);
  assert.equal(fixture.calls.filter(call => call.tool === 'curl').length, 4);
  assert.ok(fixture.calls.filter(call => call.tool === 'curl')
    .every(call => call.args.at(-1).includes('-xlslq22k6a-ew.a.run.app')));
  assert.notEqual(SERVICES[0].statusUrl, SERVICES[0].deploymentAlias);
  for (const key of ['cloud_mutation', 'build_submitted', 'service_deployed', 'job_executed',
    'resource_deleted', 'iam_mutation', 'secret_payload_access', 'object_data_access',
    'database_access', 'application_data_access', 'production_access', 'mail_sent',
    'login_flow_verified', 'floot_connected', 'rollout_retry_authorized', 'cleanup_authorized']) {
    assert.equal(receipt[key], false, key);
  }
});

test('diagnostic reports only bounded Build metadata and performs no service, job, HTTP or payload read', () => {
  const fixture = cloudFixture();
  const receipt = diagnoseBuildContract(cloudEnv, fixture.run);
  assert.equal(receipt.builds.length, 11);
  assert.equal(fixture.calls.filter(call => call.tool === 'gcloud').length, 13);
  assert.equal(fixture.calls.filter(call => call.tool === 'curl').length, 0);
  assert.equal(receipt.diagnostic_only, true);
  for (const key of ['cloud_mutation', 'secret_payload_access', 'object_data_access',
    'database_access', 'application_data_access', 'production_access',
    'rollout_retry_authorized', 'cleanup_authorized']) assert.equal(receipt[key], false);
});

test('environment diagnostic reads only bounded service and job environment metadata', () => {
  const fixture = cloudFixture((value, call) => {
    if (call.tool === 'gcloud' && call.args[1] === 'jobs' && call.args[2] === 'describe') {
      for (const item of value.spec.template.spec.template.spec.containers[0].env) {
        if (item.name === 'MIGRATION_CONFIRMATION' && item.value === '') delete item.value;
      }
    }
    return value;
  });
  const receipt = diagnoseEnvironmentContract(cloudEnv, fixture.run);
  assert.equal(receipt.services.length, 2);
  assert.equal(receipt.jobs.length, 9);
  assert.equal(fixture.calls.filter(call => call.tool === 'gcloud').length, 14);
  assert.equal(fixture.calls.filter(call => call.tool === 'curl').length, 0);
  assert.equal(receipt.environment_metadata_only, true);
  assert.ok(receipt.services.flatMap(item => item.environment)
    .some(item => item.kind === 'secret_reference' && item.secret === 'DATABASE_URL'));
  assert.ok(receipt.jobs.flatMap(item => item.environment)
    .some(item => item.name === 'MIGRATION_CONFIRMATION' && item.value === ''));
  for (const key of ['cloud_mutation', 'secret_payload_access', 'object_data_access',
    'database_access', 'application_data_access', 'production_access',
    'rollout_retry_authorized', 'cleanup_authorized']) assert.equal(receipt[key], false);
});

test('full reader treats an omitted Cloud Run empty-string value as the intended empty value', () => {
  const fixture = cloudFixture((value, call) => {
    if (call.tool === 'gcloud' && call.args[1] === 'jobs' && call.args[2] === 'describe') {
      for (const item of value.spec.template.spec.template.spec.containers[0].env) {
        if (item.name === 'MIGRATION_CONFIRMATION' && item.value === '') delete item.value;
      }
    }
    return value;
  });
  assert.equal(readPostRolloutReconciliation(cloudEnv, fixture.run).exact_rollout_resources_verified, true);
});

test('reader rejects every target/auth context mismatch before metadata or HTTP', () => {
  for (const key of Object.keys(cloudEnv)) {
    assert.throws(() => readPostRolloutReconciliation({ ...cloudEnv, [key]: 'foreign' },
      () => assert.fail('read before context')));
  }
  for (const patch of [{ CLOUDSDK_AUTH_ACCESS_TOKEN: 'token' },
    { CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT: 'foreign@example.test' },
    { GOOGLE_GHA_CREDS_PATH: '/tmp/not-a-credential' },
    { CLOUDSDK_API_ENDPOINT_OVERRIDES_RUN: 'https://foreign.example' }]) {
    assert.throws(() => readPostRolloutReconciliation({ ...cloudEnv, ...patch },
      () => assert.fail('read before auth context')));
  }
});

test('reader fails closed on altered build provenance, service URL/config, job latest execution and execution success', () => {
  const cases = [
    (value, call) => { if (call.tool === 'gcloud' && call.args[0] === 'builds' && call.args[1] === 'describe') value.status = 'FAILURE'; return value; },
    (value, call) => { if (call.tool === 'gcloud' && call.args[0] === 'builds' && call.args[1] === 'describe') value.sourceProvenance.resolvedStorageSource.bucket = 'foreign'; return value; },
    (value, call) => { if (call.tool === 'gcloud' && call.args[1] === 'services') value.status.url = value.status.url.replace('xlslq22k6a', 'foreign0000'); return value; },
    (value, call) => { if (call.tool === 'gcloud' && call.args[1] === 'services') value.spec.template.spec.containers[0].env.find(x => x.name === 'APP_VERSION').value = head; return value; },
    (value, call) => { if (call.tool === 'gcloud' && call.args[1] === 'jobs' && call.args[2] === 'describe') value.status.latestCreatedExecution.name += '-new'; return value; },
    (value, call) => { if (call.tool === 'gcloud' && call.args[1] === 'jobs' && call.args[2] === 'describe') value.spec.template.spec.parallelism = 2; return value; },
    (value, call) => { if (call.tool === 'gcloud' && call.args[1] === 'jobs' && call.args[2] === 'describe') value.spec.template.spec.template.spec.maxRetries = 1; return value; },
    (value, call) => { if (call.tool === 'gcloud' && call.args[1] === 'jobs' && call.args[2] === 'describe') value.spec.template.spec.template.spec.timeoutSeconds = '601'; return value; },
    (value, call) => { if (call.tool === 'gcloud' && call.args[2] === 'executions') value.status.succeededCount = 0; return value; },
    (value, call) => call.tool === 'curl' && !call.args.includes('OPTIONS') ? value.replace('200', '503') : value,
    (value, call) => call.tool === 'curl' && call.args.includes('OPTIONS') ? value.replace(SERVICES[1].statusUrl, 'https://foreign.example') : value,
  ];
  for (const change of cases) assert.throws(() => readPostRolloutReconciliation(cloudEnv, cloudFixture(change).run));
});

test('bounded inventories reject missing, duplicate, extra and full-page rollout resources', () => {
  const cases = [
    (value, call) => call.tool === 'gcloud' && call.args[0] === 'builds' && call.args[1] === 'list'
      ? value.slice(1) : value,
    (value, call) => call.tool === 'gcloud' && call.args[0] === 'builds' && call.args[1] === 'list'
      ? [...value.slice(0, -1), value[0]] : value,
    (value, call) => call.tool === 'gcloud' && call.args[0] === 'builds' && call.args[1] === 'list'
      ? [...value, { id: 'f'.repeat(36), status: 'SUCCESS', substitutions: { _IMAGE_TAG: ROLLOUT_TAG } }] : value,
    (value, call) => call.tool === 'gcloud' && call.args[1] === 'services' && call.args[2] === 'list'
      ? [...value, value[0]] : value,
    (value, call) => call.tool === 'gcloud' && call.args[1] === 'jobs' && call.args[2] === 'list'
      ? [...value, value[0]] : value,
  ];
  for (const change of cases) assert.throws(() => readPostRolloutReconciliation(cloudEnv, cloudFixture(change).run));
});

test('reader hides provider errors, performs no retry and never parses secret/object/database payloads', () => {
  let calls = 0;
  assert.throws(() => readPostRolloutReconciliation(cloudEnv, () => {
    calls += 1; throw Object.assign(new Error('DO_NOT_PRINT'), { stderr: 'SECRET_DO_NOT_PRINT' });
  }), /^Error: PREVIEW_POST_ROLLOUT_READ_METADATA_UNCONFIRMED$/);
  assert.equal(calls, 1);
});

test('workflow job is independent, first-attempt-only, exact-gated before WIF and contains only metadata/HTTP read entrypoints', () => {
  const workflow = readFileSync('.github/workflows/preview-deployment.yml', 'utf8');
  const start = workflow.indexOf('  reconcile-successful-rollout:');
  const end = workflow.indexOf('\n  quality-gates:', start);
  assert.ok(start > 0 && end > start);
  const job = workflow.slice(start, end);
  const testStep = job.indexOf('node --test tests/preview-post-rollout-reconciliation.test.mjs');
  const gate = job.indexOf('node scripts/deployment/verify-preview-post-rollout-reconciliation.mjs');
  const auth = job.indexOf('uses: google-github-actions/auth@v3');
  const read = job.indexOf('node scripts/deployment/read-preview-post-rollout-reconciliation.mjs --diagnose-environment');
  assert.ok(gate > 0 && gate < testStep && testStep < auth && auth < read);
  for (const permission of ['actions: read', 'contents: read', 'id-token: write', 'pull-requests: read']) {
    assert.match(job, new RegExp(permission));
  }
  assert.match(job, /if: github\.event\.action == 'synchronize'/);
  assert.match(job, /group: khedmah-preview-cloud-mutations/);
  assert.match(job, /persist-credentials: false/);
  assert.match(job, /GITHUB_RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  assert.match(job, /Read bounded Preview rollout environment metadata after held mismatch/);
  assert.doesNotMatch(job, /--diagnose-builds/);
  assert.doesNotMatch(job, /\b(?:builds submit|run deploy|run jobs (?:deploy|execute|delete)|services (?:update|delete)|projects add-iam-policy-binding|storage (?:cp|rm)|secrets versions access)\b/);
  assert.doesNotMatch(job, /needs:|workflow_dispatch|repository_dispatch/);
});
