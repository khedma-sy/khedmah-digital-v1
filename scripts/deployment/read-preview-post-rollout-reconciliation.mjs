#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  ROLLOUT_DEPLOY_JOB_ID, ROLLOUT_MERGE, ROLLOUT_RUN_ID, ROLLOUT_SOURCE,
} from './verify-preview-post-rollout-reconciliation.mjs';

export const PROJECT = 'khedmah-preview-v2-20261012';
export const PROJECT_NUMBER = '1044962071847';
export const REGION = 'europe-west1';
export const ROLLOUT_TAG = 'preview-pr-274-' + ROLLOUT_MERGE;

const REPOSITORY = 'khedmah-preview';
const SOURCE_BUCKET = PROJECT + '-cloudbuild-source';
const DATABASE_INSTANCE = PROJECT + ':' + REGION + ':khedmah-preview-v2-db';
const DEPLOYER = 'khedmah-pv2-deployer@' + PROJECT + '.iam.gserviceaccount.com';
const RUNTIME = 'khedmah-pv2-runtime@' + PROJECT + '.iam.gserviceaccount.com';
const FRONTEND = 'khedmah-pv2-frontend@' + PROJECT + '.iam.gserviceaccount.com';
const MIGRATOR = 'khedmah-pv2-migrator@' + PROJECT + '.iam.gserviceaccount.com';
const BUILD_ACCOUNT = `projects/${PROJECT}/serviceAccounts/khedmah-pv2-build@${PROJECT}.iam.gserviceaccount.com`;
const IMAGE_ROOT = `${REGION}-docker.pkg.dev/${PROJECT}/${REPOSITORY}`;
const stop = code => { throw new Error('PREVIEW_POST_ROLLOUT_READ_' + code); };

export const BUILDS = Object.freeze([
  ['6be74d6a-ad8a-4914-b4e0-c648371ad27f', 'foundation-migrations', 'source/1792000334.767931-a0e92fd0786a4c5a94352b277143161b.tgz'],
  ['c26a26cb-3d02-47a9-ad3e-0f86f16161b8', 'product-store-migration', 'source/1792000439.042268-f045402ba14543bbb53653004b413f38.tgz'],
  ['74980581-6157-4152-b49f-ef5a07d50017', 'classifieds-migration', 'source/1792000523.435352-fd00718328d44f9da8190e1ee8587d0b.tgz'],
  ['ff2546a3-d68a-4a6d-bca4-24c2cc9db94a', 'fulfillment-migration', 'source/1792000582.280019-0439f270317d4b6cb2897c5afc62eefd.tgz'],
  ['e4805268-4ff6-4948-9e37-bbd9939c4e68', 'taxi-pricing-migration', 'source/1792000644.44223-758d48d0b2574909972f9c50185f30f2.tgz'],
  ['a2f9f51f-3acc-4fca-b35c-31ee33342ea1', 'billing-migration', 'source/1792000703.951851-33e60f6d63ed4805b1db590fc0553f76.tgz'],
  ['4439719d-70b2-4183-bd62-a2f9082f5281', 'taxi-operational-migration', 'source/1792000764.214919-64f0759acc9d49a699b902c053c4511d.tgz'],
  ['e16bc51d-690a-4f9c-bae8-13d5cc6b8632', 'taxi-operational-profile-gate-migration', 'source/1792000858.472706-3e67825149a640b492b234401cc0d19b.tgz'],
  ['94713716-b1d8-497a-9dc0-7aca875686dc', 'food-promotions-migration', 'source/1792000941.694223-3e3b371caa6847b2bbb5a628181bd9c5.tgz'],
  ['fa4fd467-25c9-449a-ac7a-ad2ce6e55386', 'backend', 'source/1792001030.388022-ef21c34f82fa4c868241d559e47ebd68.tgz'],
  ['51658145-5ba0-49f1-a5d5-c420e5124d13', 'frontend', 'source/1792001185.560423-51ee1835deb549c1b6da9b73b8770c08.tgz'],
].map(([id, component, sourceObject]) => Object.freeze({ id, component, sourceObject,
  image: `${IMAGE_ROOT}/${component}:${ROLLOUT_TAG}` })));

export const SERVICES = Object.freeze([
  Object.freeze({
    name: 'khedmah-pr-274-backend', revision: 'khedmah-pr-274-backend-00002-9dn',
    statusUrl: 'https://khedmah-pr-274-backend-xlslq22k6a-ew.a.run.app',
    deploymentAlias: `https://khedmah-pr-274-backend-${PROJECT_NUMBER}.${REGION}.run.app`,
    identity: RUNTIME, component: 'backend', image: `${IMAGE_ROOT}/backend:${ROLLOUT_TAG}`,
  }),
  Object.freeze({
    name: 'khedmah-pr-274-frontend', revision: 'khedmah-pr-274-frontend-00001-k5m',
    statusUrl: 'https://khedmah-pr-274-frontend-xlslq22k6a-ew.a.run.app',
    deploymentAlias: `https://khedmah-pr-274-frontend-${PROJECT_NUMBER}.${REGION}.run.app`,
    identity: FRONTEND, component: 'frontend', image: `${IMAGE_ROOT}/frontend:${ROLLOUT_TAG}`,
  }),
]);

export const JOBS = Object.freeze([
  ['foundation-001-022', 'foundation-migrations', '2q8lr', {
    FOUNDATION_MANIFEST_SHA256: 'a7905bdf45f3abe7b9efb7ea216781877aeaa1a8f8806a88d7fb7933f248442e' }],
  ['product-store-024', 'product-store-migration', 'v982s', {
    MIGRATION_CONFIRMATION: '', MIGRATION_SHA256: 'd2141fab35a163cd46511d35bef13a060f9ceb4b2d25acbedb0afa44a4be16a6' }],
  ['classifieds-025', 'classifieds-migration', 'z7v87', {
    MIGRATION_CONFIRMATION: '', MIGRATION_SHA256: '0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d' }],
  ['fulfillment-026-028', 'fulfillment-migration', 'k9rkh', { MIGRATION_CONFIRMATION: '' }],
  ['taxi-pricing-029', 'taxi-pricing-migration', 'jk44k', {
    MIGRATION_CONFIRMATION: '', MIGRATION_SHA256: 'df9a7467f59f00e0167233901e6d7bb1e686994e8f97aec43696d53ac2d7870e' }],
  ['billing-030-033', 'billing-migration', 'lpx52', {
    MIGRATION_CONFIRMATION: '',
    MIGRATION_SHA256: 'd758036cbcf20fbcee176c9ea7ba097564142de839b609b22a5cb469d6335194',
    MIGRATION_GIT_BLOB: '88795ee75d9948e5ecf85d8c2d53f6b77397b52b',
    MIGRATION_033_SHA256: 'acc42c10459b0f90c276e843942bc712283616fc71ac854c177bb20defa34463',
    MIGRATION_033_GIT_BLOB: '7bbdd79c5c129f41134c10ba15eedc644e396888' }],
  ['taxi-operational-031', 'taxi-operational-migration', 'tttlg', {
    MIGRATION_CONFIRMATION: '', MIGRATION_SHA256: '148dfe66ee1a2c838225a14fe90dcac51e8c7a87ee56d277275142e20bcc6f5b' }],
  ['taxi-operational-032', 'taxi-operational-profile-gate-migration', '26hdw', {
    MIGRATION_CONFIRMATION: '', MIGRATION_SHA256: 'fd99e0cd9b3c7763ed938080f8526d7d7a38335343c6b2ec379bd2a35f3ad588' }],
  ['food-promotions-034', 'food-promotions-migration', 'k75ng', {
    MIGRATION_CONFIRMATION: '', MIGRATION_SHA256: '127206eb637c285b5fe8ed7bba389360562288e27cc3379d22596fb7dc2ac2dd' }],
].map(([stage, component, suffix, stageEnv]) => {
  const name = 'khedmah-preview-schema-' + stage;
  return Object.freeze({ stage, component, name, execution: name + '-' + suffix,
    image: `${IMAGE_ROOT}/${component}:${ROLLOUT_TAG}`,
    timeoutSeconds: stage === 'foundation-001-022' ? '900' : '600',
    stageEnv: Object.freeze(stageEnv) });
}));

function exactContext(env) {
  const expected = {
    GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'PR Preview',
    GITHUB_REPOSITORY: 'khedma-sy/khedmah-digital-v1', GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_REF: 'refs/pull/274/merge', GITHUB_RUN_ATTEMPT: '1',
    PREVIEW_PR_NUMBER: '274', PREVIEW_EVENT_ACTION: 'synchronize',
    PREVIEW_GOOGLE_CLOUD_PROJECT: PROJECT, GOOGLE_CLOUD_REGION: REGION,
    PREVIEW_ARTIFACT_REPOSITORY: REPOSITORY,
    PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME: DATABASE_INSTANCE,
    PREVIEW_V2_DEPLOYER_SERVICE_ACCOUNT: DEPLOYER,
    PREVIEW_V2_RUNTIME_SERVICE_ACCOUNT: RUNTIME,
    PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_FIREBASE_PROJECT_ID: 'khedma-dl',
  };
  if (Object.entries(expected).some(([key, value]) => env[key] !== value)
      || !/^[a-f0-9]{40}$/.test(env.PREVIEW_HEAD_SHA ?? '')) stop('CONTEXT_HELD');
  const credential = env.GOOGLE_GHA_CREDS_PATH ?? '';
  if (!/(^|\/)gha-creds-[^/]+[.]json$/.test(credential)
      || env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE !== credential
      || env.CLOUDSDK_AUTH_ACCESS_TOKEN || env.CLOUDSDK_AUTH_ACCESS_TOKEN_FILE
      || env.CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT
      || Object.entries(env).some(([key, value]) => key.startsWith('CLOUDSDK_API_ENDPOINT_OVERRIDES_') && value)
      || (env.CLOUDSDK_CORE_UNIVERSE_DOMAIN && env.CLOUDSDK_CORE_UNIVERSE_DOMAIN !== 'googleapis.com')) {
    stop('AUTH_CONTEXT_HELD');
  }
}

function jsonRead(run, env, args, fields) {
  const command = args.join(' ');
  const allowed = [
    /^projects describe khedmah-preview-v2-20261012$/,
    /^builds list --region=europe-west1 --filter=substitutions[.]_IMAGE_TAG=preview-pr-274-[a-f0-9]{40} --limit=12$/,
    /^builds describe [a-f0-9-]{36} --region=europe-west1$/,
    /^run services list --region=europe-west1 --limit=3$/,
    /^run services describe khedmah-pr-274-(?:backend|frontend) --region=europe-west1$/,
    /^run jobs list --region=europe-west1 --limit=10$/,
    /^run jobs describe khedmah-preview-schema-[a-z0-9-]+ --region=europe-west1$/,
    /^run jobs executions describe khedmah-preview-schema-[a-z0-9-]+ --region=europe-west1$/,
  ];
  if (!allowed.some(pattern => pattern.test(command))) stop('COMMAND_REJECTED');
  const options = {
    encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, LC_ALL: 'C', CLOUDSDK_CORE_PROJECT: PROJECT,
      CLOUDSDK_CORE_UNIVERSE_DOMAIN: 'googleapis.com',
      CLOUDSDK_CORE_DISABLE_PROMPTS: 'true', CLOUDSDK_CORE_LOG_HTTP: 'false',
      CLOUDSDK_CORE_DISABLE_FILE_LOGGING: 'true', CLOUDSDK_CORE_USER_OUTPUT_ENABLED: 'true' },
  };
  let raw;
  try {
    raw = run('gcloud', [...args, '--project=' + PROJECT, '--user-output-enabled',
      '--verbosity=error', '--format=json(' + fields + ')'], options);
  } catch { stop('METADATA_UNCONFIRMED'); }
  try { return JSON.parse(raw); } catch { stop('INVALID_METADATA'); }
}

function exactInventory(items, expectedNames, limit, nameOf) {
  if (!Array.isArray(items) || items.length >= limit) stop('INVENTORY_INCOMPLETE');
  const names = items.map(nameOf);
  if (names.some(name => typeof name !== 'string') || new Set(names).size !== names.length
      || names.length !== expectedNames.length
      || [...names].sort().join('\n') !== [...expectedNames].sort().join('\n')) stop('INVENTORY_MISMATCH');
  return [...names].sort();
}

function envMap(items) {
  if (!Array.isArray(items)) stop('ENV_METADATA_INVALID');
  const map = new Map();
  for (const item of items) {
    if (typeof item?.name !== 'string' || map.has(item.name)) stop('ENV_METADATA_INVALID');
    map.set(item.name, item);
  }
  return map;
}

function requirePlain(map, name, value) {
  const item = map.get(name);
  if (!item || item.value !== value || item.valueFrom !== undefined) stop('ENV_CONTRACT_MISMATCH');
}

function requireSecret(map, name, secret, version) {
  const item = map.get(name);
  if (!item || Object.hasOwn(item, 'value')
      || item.valueFrom?.secretKeyRef?.name !== secret
      || String(item.valueFrom.secretKeyRef.key) !== version) stop('SECRET_REFERENCE_MISMATCH');
}

function ready(conditions, type = 'Ready') {
  return Array.isArray(conditions) && conditions.some(item => item?.type === type && item.status === 'True');
}

function buildReceipt(metadata, expected) {
  const source = metadata?.source?.storageSource;
  const resolved = metadata?.sourceProvenance?.resolvedStorageSource;
  const images = metadata?.results?.images;
  if (metadata?.id !== expected.id || metadata.status !== 'SUCCESS'
      || metadata.projectId !== PROJECT
      || metadata.name !== `projects/${PROJECT}/locations/${REGION}/builds/${expected.id}`
      || metadata.serviceAccount !== BUILD_ACCOUNT
      || source?.bucket !== SOURCE_BUCKET || source.object !== expected.sourceObject
      || resolved?.bucket !== SOURCE_BUCKET || resolved.object !== expected.sourceObject
      || !/^[1-9][0-9]*$/.test(String(resolved.generation ?? ''))
      || !Array.isArray(images) || images.length !== 1 || images[0]?.name !== expected.image
      || !/^sha256:[a-f0-9]{64}$/.test(images[0]?.digest ?? '')
      || metadata.substitutions?._IMAGE_TAG !== ROLLOUT_TAG
      || metadata.substitutions?._REGION !== REGION
      || metadata.substitutions?._REPOSITORY !== REPOSITORY) stop('BUILD_CONTRACT_MISMATCH');
  if (expected.component === 'frontend'
      && (metadata.substitutions?._NEXT_PUBLIC_API_URL !== SERVICES[0].statusUrl
        || metadata.substitutions?._NEXT_PUBLIC_CLASSIFIEDS_ENABLED !== 'true')) {
    stop('FRONTEND_BUILD_SUBSTITUTIONS_MISMATCH');
  }
  return { id: expected.id, component: expected.component, status: 'SUCCESS',
    image: expected.image, digest: images[0].digest, resolved_source_bucket: SOURCE_BUCKET };
}

function serviceReceipt(metadata, expected) {
  const spec = metadata?.spec?.template?.spec;
  const status = metadata?.status;
  const traffic = status?.traffic;
  const containers = spec?.containers;
  if (metadata?.metadata?.name !== expected.name
      || String(metadata.metadata.namespace) !== PROJECT_NUMBER || metadata.metadata.deletionTimestamp
      || metadata.metadata.labels?.['cloud.googleapis.com/location'] !== REGION
      || String(status?.observedGeneration) !== String(metadata.metadata.generation)
      || !ready(status?.conditions) || status.latestCreatedRevisionName !== expected.revision
      || status.latestReadyRevisionName !== expected.revision || status.url !== expected.statusUrl
      || !Array.isArray(traffic) || traffic.length !== 1 || traffic[0]?.revisionName !== expected.revision
      || traffic[0]?.percent !== 100 || !Array.isArray(containers) || containers.length !== 1
      || spec.serviceAccountName !== expected.identity || containers[0]?.image !== expected.image) {
    stop('SERVICE_CONTRACT_MISMATCH');
  }
  const vars = envMap(containers[0].env);
  requirePlain(vars, 'NODE_ENV', 'preview');
  requirePlain(vars, 'APP_VERSION', ROLLOUT_TAG);
  requirePlain(vars, 'TAXI_TRIPS_ENABLED', 'false');
  if (expected.component === 'backend') {
    for (const [name, value] of Object.entries({
      CLOUD_SQL_INSTANCE_CONNECTION_NAME: DATABASE_INSTANCE,
      CLASSIFIEDS_ENABLED: 'true', TAXI_ACCESS_ENABLED: 'true',
      GCS_MEDIA_BUCKET: PROJECT + '.firebasestorage.app', EMAIL_FROM: 'noreply@mail.khedmah.uk',
      CORS_ORIGIN: SERVICES[1].statusUrl, NEXT_PUBLIC_SITE_URL: SERVICES[1].statusUrl,
    })) requirePlain(vars, name, value);
    requireSecret(vars, 'DATABASE_URL', 'DATABASE_URL', '1');
    requireSecret(vars, 'FIREBASE_API_KEY', 'FIREBASE_API_KEY', '1');
    requireSecret(vars, 'RESEND_API_KEY', 'RESEND_API_KEY', 'latest');
    if (metadata.spec.template.metadata?.annotations?.['run.googleapis.com/cloudsql-instances'] !== DATABASE_INSTANCE
        || vars.size !== 13) stop('SERVICE_BACKEND_CONFIGURATION_MISMATCH');
  } else if (vars.size !== 3 || metadata.spec.template.metadata?.annotations?.['run.googleapis.com/cloudsql-instances']) {
    stop('SERVICE_FRONTEND_CONFIGURATION_MISMATCH');
  }
  return { name: expected.name, revision: expected.revision, traffic_percent: 100,
    status_url: expected.statusUrl, deployment_log_alias: expected.deploymentAlias,
    identity: expected.identity, image: expected.image, env_names: [...vars.keys()].sort(),
    secret_references: [...vars].filter(([, item]) => item.valueFrom?.secretKeyRef)
      .map(([name, item]) => ({ env: name, secret: item.valueFrom.secretKeyRef.name,
        version: String(item.valueFrom.secretKeyRef.key) })).sort((a, b) => a.env.localeCompare(b.env)) };
}

function jobReceipt(metadata, execution, expected) {
  const executionTemplate = metadata?.spec?.template?.spec;
  const spec = executionTemplate?.template?.spec;
  const status = metadata?.status;
  const containers = spec?.containers;
  if (metadata?.metadata?.name !== expected.name
      || String(metadata.metadata.namespace) !== PROJECT_NUMBER || metadata.metadata.deletionTimestamp
      || metadata.metadata.labels?.['cloud.googleapis.com/location'] !== REGION
      || metadata.metadata.labels?.['khedmah-schema-pool'] !== 'bounded-v1'
      || metadata.metadata.labels?.['khedmah-schema-stage'] !== expected.stage
      || String(status?.observedGeneration) !== String(metadata.metadata.generation)
      || !ready(status?.conditions) || status.latestCreatedExecution?.name !== expected.execution
      || status.executionCount !== 1
      || executionTemplate?.taskCount !== 1 || executionTemplate.parallelism !== 1
      || spec?.maxRetries !== 0 || String(spec?.timeoutSeconds) !== expected.timeoutSeconds
      || spec?.serviceAccountName !== MIGRATOR || !Array.isArray(containers) || containers.length !== 1
      || containers[0]?.image !== expected.image
      || metadata.spec.template.metadata?.annotations?.['run.googleapis.com/cloudsql-instances'] !== DATABASE_INSTANCE) {
    stop('JOB_CONTRACT_MISMATCH');
  }
  const vars = envMap(containers[0].env);
  requirePlain(vars, 'DEPLOYMENT_ENVIRONMENT', 'preview');
  requirePlain(vars, 'GOOGLE_CLOUD_PROJECT', PROJECT);
  requirePlain(vars, 'PRODUCTION_GOOGLE_CLOUD_PROJECT', 'khedma-dl');
  requirePlain(vars, 'CLOUD_SQL_INSTANCE_CONNECTION_NAME', DATABASE_INSTANCE);
  requirePlain(vars, 'MIGRATION_MODE', 'verify');
  requireSecret(vars, 'DATABASE_URL', 'DATABASE_MIGRATION_URL', '1');
  const expectedNames = ['DEPLOYMENT_ENVIRONMENT', 'GOOGLE_CLOUD_PROJECT',
    'PRODUCTION_GOOGLE_CLOUD_PROJECT', 'CLOUD_SQL_INSTANCE_CONNECTION_NAME',
    'MIGRATION_MODE', 'DATABASE_URL', ...Object.keys(expected.stageEnv)].sort();
  if ([...vars.keys()].sort().join('\n') !== expectedNames.join('\n')) stop('JOB_ENV_ALLOWLIST_MISMATCH');
  for (const [name, value] of Object.entries(expected.stageEnv)) requirePlain(vars, name, value);
  if (execution?.metadata?.name !== expected.execution
      || String(execution.metadata.namespace) !== PROJECT_NUMBER
      || execution.metadata.labels?.['run.googleapis.com/job'] !== expected.name
      || !ready(execution.status?.conditions, 'Completed') || !execution.status?.completionTime
      || (execution.status.runningCount ?? 0) !== 0 || (execution.status.failedCount ?? 0) !== 0
      || (execution.status.cancelledCount ?? 0) !== 0
      || (execution.status.retriedCount ?? 0) !== 0
      || execution.status.succeededCount !== 1) stop('EXECUTION_CONTRACT_MISMATCH');
  return { name: expected.name, stage: expected.stage, image: expected.image,
    identity: MIGRATOR, latest_execution: expected.execution, latest_execution_succeeded: true,
    task_count: 1, parallelism: 1, max_retries: 0,
    timeout_seconds: Number(expected.timeoutSeconds),
    env_names: [...vars.keys()].sort(), secret_reference: {
      env: 'DATABASE_URL', secret: 'DATABASE_MIGRATION_URL', version: '1' } };
}

function httpRead(run, env, url, options = []) {
  let raw;
  try {
    raw = run('curl', ['-q', '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '30',
      '--proto', '=https', '--output', '/dev/null', ...options,
      '--write-out', '\nKHEDMAH_HTTP_STATUS=%{http_code}\n', url], {
      encoding: 'utf8', timeout: 45000, maxBuffer: 128 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, LC_ALL: 'C' },
    });
  } catch { stop('HTTP_UNCONFIRMED'); }
  const match = raw.match(/(?:^|\n)KHEDMAH_HTTP_STATUS=([0-9]{3})\n?$/);
  if (!match) stop('HTTP_INVALID_RESPONSE');
  return { code: Number(match[1]), headers: raw.slice(0, match.index) };
}

function corsReceipt(run, env) {
  const origin = SERVICES[1].statusUrl;
  const response = httpRead(run, env, SERVICES[0].statusUrl + '/api/v1/auth/session', [
    '--request', 'OPTIONS', '--header', 'Origin: ' + origin,
    '--header', 'Access-Control-Request-Method: POST', '--dump-header', '-',
  ]);
  const blocks = response.headers.split(/\r?\n\r?\n/).filter(block => /^HTTP\/\S+ [0-9]{3}/.test(block));
  const block = blocks.at(-1) ?? '';
  const values = name => block.split(/\r?\n/).filter(line => line.toLowerCase().startsWith(name + ':'))
    .map(line => line.slice(line.indexOf(':') + 1).trim());
  if (response.code < 200 || response.code >= 300
      || values('access-control-allow-origin').length !== 1
      || values('access-control-allow-origin')[0] !== origin
      || values('access-control-allow-credentials').length !== 1
      || values('access-control-allow-credentials')[0] !== 'true'
      || values('access-control-allow-methods').length !== 1
      || !values('access-control-allow-methods')[0].split(',').map(value => value.trim()).includes('POST')) {
    stop('CORS_UNCONFIRMED');
  }
  return { status: response.code, origin, credentialed_origin_verified: true };
}

export function diagnoseBuildContract(env, run = execFileSync) {
  exactContext(env);
  const project = jsonRead(run, env, ['projects', 'describe', PROJECT],
    'projectId,projectNumber,lifecycleState');
  if (project?.projectId !== PROJECT || String(project.projectNumber) !== PROJECT_NUMBER
      || project.lifecycleState !== 'ACTIVE') stop('PROJECT_IDENTITY_UNCONFIRMED');
  const inventory = jsonRead(run, env,
    ['builds', 'list', '--region=' + REGION, '--filter=substitutions._IMAGE_TAG=' + ROLLOUT_TAG, '--limit=12'],
    'id,status,substitutions');
  const ids = exactInventory(inventory, BUILDS.map(item => item.id), 12, item => {
    if (item?.status !== 'SUCCESS' || item?.substitutions?._IMAGE_TAG !== ROLLOUT_TAG) return undefined;
    return item.id;
  });
  const builds = BUILDS.map(expected => {
    const metadata = jsonRead(run, env, ['builds', 'describe', expected.id, '--region=' + REGION],
      'id,name,projectId,status,serviceAccount,substitutions,source.storageSource,'
      + 'sourceProvenance.resolvedStorageSource,results.images');
    return {
      expected_id: expected.id,
      id: metadata?.id ?? null,
      name: metadata?.name ?? null,
      project_id: metadata?.projectId ?? null,
      status: metadata?.status ?? null,
      service_account: metadata?.serviceAccount ?? null,
      source: metadata?.source?.storageSource ?? null,
      resolved_source: metadata?.sourceProvenance?.resolvedStorageSource ?? null,
      images: Array.isArray(metadata?.results?.images) ? metadata.results.images : null,
      substitutions: Object.fromEntries(Object.entries(metadata?.substitutions ?? {})
        .filter(([name]) => ['_IMAGE_TAG', '_REGION', '_REPOSITORY',
          '_NEXT_PUBLIC_API_URL', '_NEXT_PUBLIC_CLASSIFIEDS_ENABLED'].includes(name))),
    };
  });
  return {
    evidence_utc: new Date().toISOString(), project: PROJECT, rollout_tag: ROLLOUT_TAG,
    build_inventory_ids: ids, builds,
    diagnostic_only: true, read_only_reconciliation: true, cloud_mutation: false,
    secret_payload_access: false, object_data_access: false, database_access: false,
    application_data_access: false, production_access: false,
    rollout_retry_authorized: false, cleanup_authorized: false,
  };
}

export function readPostRolloutReconciliation(env, run = execFileSync) {
  exactContext(env);
  const project = jsonRead(run, env, ['projects', 'describe', PROJECT],
    'projectId,projectNumber,lifecycleState');
  if (project?.projectId !== PROJECT || String(project.projectNumber) !== PROJECT_NUMBER
      || project.lifecycleState !== 'ACTIVE') stop('PROJECT_IDENTITY_UNCONFIRMED');

  const buildInventory = jsonRead(run, env,
    ['builds', 'list', '--region=' + REGION, '--filter=substitutions._IMAGE_TAG=' + ROLLOUT_TAG, '--limit=12'],
    'id,status,substitutions');
  const buildIds = exactInventory(buildInventory, BUILDS.map(item => item.id), 12, item => {
    if (item?.status !== 'SUCCESS' || item?.substitutions?._IMAGE_TAG !== ROLLOUT_TAG) return undefined;
    return item.id;
  });

  const builds = BUILDS.map(expected => buildReceipt(jsonRead(run, env,
    ['builds', 'describe', expected.id, '--region=' + REGION],
    'id,name,projectId,status,createTime,finishTime,serviceAccount,substitutions,source.storageSource,'
    + 'sourceProvenance.resolvedStorageSource,results.images'), expected));

  const serviceInventory = jsonRead(run, env,
    ['run', 'services', 'list', '--region=' + REGION, '--limit=3'],
    'metadata.name,metadata.namespace,metadata.labels');
  const serviceNames = exactInventory(serviceInventory, SERVICES.map(item => item.name), 3, item => {
    if (String(item?.metadata?.namespace) !== PROJECT_NUMBER
        || item?.metadata?.labels?.['cloud.googleapis.com/location'] !== REGION) return undefined;
    return item.metadata.name;
  });

  const services = SERVICES.map(expected => serviceReceipt(jsonRead(run, env,
    ['run', 'services', 'describe', expected.name, '--region=' + REGION],
    'metadata.name,metadata.namespace,metadata.generation,metadata.deletionTimestamp,metadata.labels,'
    + 'spec.template.metadata.annotations,spec.template.spec.serviceAccountName,'
    + 'spec.template.spec.containers[].image,spec.template.spec.containers[].env,'
    + 'status.observedGeneration,status.conditions,status.latestCreatedRevisionName,'
    + 'status.latestReadyRevisionName,status.traffic,status.url'), expected));

  const jobInventory = jsonRead(run, env, ['run', 'jobs', 'list', '--region=' + REGION, '--limit=10'],
    'metadata.name,metadata.namespace,metadata.labels');
  const jobNames = exactInventory(jobInventory, JOBS.map(item => item.name), 10, item => {
    if (String(item?.metadata?.namespace) !== PROJECT_NUMBER
        || item?.metadata?.labels?.['cloud.googleapis.com/location'] !== REGION) return undefined;
    return item.metadata.name;
  });

  const jobs = JOBS.map(expected => {
    const job = jsonRead(run, env, ['run', 'jobs', 'describe', expected.name, '--region=' + REGION],
      'metadata.name,metadata.namespace,metadata.generation,metadata.deletionTimestamp,metadata.labels,'
      + 'spec.template.metadata.annotations,spec.template.spec.taskCount,spec.template.spec.parallelism,'
      + 'spec.template.spec.template.spec.maxRetries,spec.template.spec.template.spec.timeoutSeconds,'
      + 'spec.template.spec.template.spec.serviceAccountName,'
      + 'spec.template.spec.template.spec.containers[].image,spec.template.spec.template.spec.containers[].env,'
      + 'status.observedGeneration,status.conditions,status.executionCount,status.latestCreatedExecution');
    const execution = jsonRead(run, env,
      ['run', 'jobs', 'executions', 'describe', expected.execution, '--region=' + REGION],
      'metadata.name,metadata.namespace,metadata.labels,status.startTime,status.completionTime,'
      + 'status.runningCount,status.succeededCount,status.failedCount,status.cancelledCount,'
      + 'status.retriedCount,status.conditions');
    return jobReceipt(job, execution, expected);
  });

  const endpoints = [
    ['backend_health', SERVICES[0].statusUrl + '/api/v1/health'],
    ['backend_ready', SERVICES[0].statusUrl + '/api/v1/health/ready'],
    ['frontend_root', SERVICES[1].statusUrl + '/'],
  ].map(([name, url]) => {
    const response = httpRead(run, env, url, ['--request', 'GET']);
    if (response.code !== 200) stop('HTTP_STATUS_UNCONFIRMED');
    return { name, url, status: response.code };
  });
  const cors = corsReceipt(run, env);

  return {
    evidence_utc: new Date().toISOString(), project: PROJECT, project_number: PROJECT_NUMBER,
    rollout_source: ROLLOUT_SOURCE, rollout_merge: ROLLOUT_MERGE,
    rollout_run_id: ROLLOUT_RUN_ID, rollout_deploy_job_id: ROLLOUT_DEPLOY_JOB_ID,
    rollout_tag: ROLLOUT_TAG, build_count: builds.length, build_inventory_ids: buildIds, builds,
    service_count: services.length, service_inventory_names: serviceNames, services,
    job_count: jobs.length, job_inventory_names: jobNames, jobs,
    anonymous_http: endpoints, cors,
    exact_rollout_resources_verified: builds.length === 11 && services.length === 2 && jobs.length === 9,
    read_only_reconciliation: true, cloud_mutation: false, build_submitted: false,
    service_deployed: false, job_executed: false, resource_deleted: false, iam_mutation: false,
    secret_payload_access: false, object_data_access: false, database_access: false,
    application_data_access: false, production_access: false, mail_sent: false,
    login_flow_verified: false, floot_connected: false,
    rollout_retry_authorized: false, cleanup_authorized: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--diagnose-builds') {
      console.log('PREVIEW_POST_ROLLOUT_BUILD_DIAGNOSTIC='
        + JSON.stringify(diagnoseBuildContract(process.env)));
      console.log('PREVIEW_POST_ROLLOUT_BUILD_DIAGNOSTIC_READ_COMPLETED_NO_MUTATION');
    } else {
      if (process.argv.length !== 2) stop('ARGUMENTS_HELD');
      console.log('PREVIEW_POST_ROLLOUT_RECONCILIATION='
        + JSON.stringify(readPostRolloutReconciliation(process.env)));
      console.log('PREVIEW_POST_ROLLOUT_RECONCILIATION_READ_COMPLETED_NO_MUTATION');
    }
  } catch (error) {
    console.error('STOP: ' + (/^PREVIEW_POST_ROLLOUT_READ_[A-Z_]+$/.test(error?.message ?? '')
      ? error.message : 'PREVIEW_POST_ROLLOUT_READ_UNCONFIRMED_HELD'));
    process.exitCode = 1;
  }
}
