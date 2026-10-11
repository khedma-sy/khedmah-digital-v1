#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { summarizeExecutions } from './preview-job-candidate-review.mjs';

export const STAGES = Object.freeze({
  'foundation-001-022': 'foundation-migrations',
  'product-store-024': 'product-store-migration',
  'classifieds-025': 'classifieds-migration',
  'fulfillment-026-028': 'fulfillment-migration',
  'taxi-pricing-029': 'taxi-pricing-migration',
  'billing-030-033': 'billing-migration',
  'taxi-operational-031': 'taxi-operational-migration',
  'taxi-operational-032': 'taxi-operational-profile-gate-migration',
  'food-promotions-034': 'food-promotions-migration',
});
const POLICY = Object.freeze({
  project_sha256: '9ff100125b4a00e62a9ed621f8e25ed90ceb9a47b6c03c8bb0fa66a3f782329f',
  namespace: '195546947562', region: 'europe-west1',
});
const hash = value => createHash('sha256').update(value).digest('hex');
const stop = code => { throw new Error('PREVIEW_SCHEMA_POOL_' + code); };

export function schemaJobName(environment, identifier, stage) {
  if (!Object.hasOwn(STAGES, stage) || !['preview', 'staging'].includes(environment)
      || !/^[a-zA-Z0-9._-]+$/.test(identifier)) stop('ARGUMENTS_REJECTED');
  if (environment === 'staging') return `khedmah-staging-${stage}-${hash(identifier).slice(0, 10)}`;
  if (!/^pr-[1-9][0-9]*-[a-f0-9]{7,40}$/.test(identifier)) stop('IDENTIFIER_REJECTED');
  return 'khedmah-preview-schema-' + stage;
}

export function validatePoolTarget(env, policy = POLICY) {
  const project = env.GOOGLE_CLOUD_PROJECT;
  if (typeof project !== 'string' || !/^khedmah-preview-[a-z0-9-]+$/.test(project)
      || hash(project) !== policy.project_sha256 || env.GOOGLE_CLOUD_REGION !== policy.region
      || env.PRODUCTION_GOOGLE_CLOUD_PROJECT !== 'khedma-dl'
      || env.PRODUCTION_FIREBASE_PROJECT_ID !== 'khedma-dl'
      || project === 'khedma-dl'
      || env.PREVIEW_SCHEMA_POOL_SERIALIZED !== 'true'
      || env.GITHUB_ACTIONS !== 'true' || env.GITHUB_WORKFLOW !== 'PR Preview'
      || env.GITHUB_REPOSITORY !== 'khedma-sy/khedmah-digital-v1'
      || !/^[a-z][a-z0-9-]{0,62}$/.test(env.ARTIFACT_REPOSITORY ?? '')
      || !new RegExp('^[a-z][a-z0-9-]+@' + project + '\\.iam\\.gserviceaccount\\.com$').test(env.RUNTIME_SERVICE_ACCOUNT ?? '')
      || !env.CLOUD_SQL_INSTANCE_CONNECTION_NAME?.startsWith(project + ':' + policy.region + ':')) {
    stop('TARGET_OR_SERIALIZATION_REJECTED');
  }
}

// This read guard is not a distributed lock. All Preview cloud mutation jobs
// share the workflow concurrency group; external/manual writers must stay stopped.
export function checkSchemaJob(env, environment, identifier, stage, phase, run = execFileSync, policy = POLICY) {
  const name = schemaJobName(environment, identifier, stage);
  if (!['before-deploy', 'before-execute'].includes(phase)) stop('PHASE_REJECTED');
  if (environment === 'staging') return name; // Preserve Staging's existing resource names and calls.
  validatePoolTarget(env, policy);
  const options = { encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_USER_OUTPUT_ENABLED: 'true' } };
  const read = (args, fields) => {
    try {
      return JSON.parse(run('gcloud', [...args, '--project=' + env.GOOGLE_CLOUD_PROJECT,
        '--region=' + policy.region, '--user-output-enabled', '--format=json(' + fields + ')'], options));
    } catch { stop('READ_FAILED_STOP_NO_RETRY'); }
  };
  // Absence is accepted only after a successful complete list, never from a failed describe.
  const inventory = read(['run', 'jobs', 'list', '--limit=2000'], 'metadata.name');
  if (!Array.isArray(inventory) || inventory.length >= 2000
      || inventory.some(x => !/^[a-z][a-z0-9-]{0,62}$/.test(x?.metadata?.name ?? ''))
      || new Set(inventory.map(x => x.metadata.name)).size !== inventory.length) stop('INVENTORY_INVALID');
  if (!inventory.some(x => x.metadata.name === name)) {
    if (phase === 'before-execute') stop('JOB_MISSING_AFTER_DEPLOY');
    return name;
  }
  const job = read(['run', 'jobs', 'describe', name],
    'metadata.name,metadata.uid,metadata.namespace,metadata.generation,metadata.deletionTimestamp,metadata.labels,'
    + 'spec.template.metadata.annotations,spec.template.spec.template.spec.serviceAccountName,'
    + 'spec.template.spec.template.spec.containers[].image,status.observedGeneration,status.conditions,status.executionCount,status.latestCreatedExecution');
  const meta = job?.metadata, status = job?.status, spec = job?.spec?.template?.spec?.template?.spec;
  const ready = status?.conditions?.filter(x => x.type === 'Ready');
  if (meta?.name !== name || meta.namespace !== policy.namespace || !/^[a-f0-9-]{20,64}$/.test(meta.uid ?? '')
      || meta.deletionTimestamp || meta.labels?.['cloud.googleapis.com/location'] !== policy.region
      || meta.labels?.['khedmah-schema-pool'] !== 'bounded-v1' || meta.labels?.['khedmah-schema-stage'] !== stage
      || !Number.isSafeInteger(meta.generation) || meta.generation < 1 || status?.observedGeneration !== meta.generation
      || ready?.length !== 1 || ready[0].status !== 'True'
      || !Number.isSafeInteger(status.executionCount ?? 0) || (status.executionCount ?? 0) < 0
      || spec?.serviceAccountName !== env.RUNTIME_SERVICE_ACCOUNT
      || !Array.isArray(spec?.containers) || spec.containers.length !== 1
      || job.spec.template.metadata?.annotations?.['run.googleapis.com/cloudsql-instances'] !== env.CLOUD_SQL_INSTANCE_CONNECTION_NAME) {
    stop('OWNERSHIP_OR_RECONCILIATION_REJECTED');
  }
  const imageBase = policy.region + '-docker.pkg.dev/' + env.GOOGLE_CLOUD_PROJECT + '/'
    + env.ARTIFACT_REPOSITORY + '/' + STAGES[stage] + ':preview-';
  const image = spec.containers[0]?.image;
  if (typeof image !== 'string' || !image.startsWith(imageBase)
      || !/^pr-[1-9][0-9]*-[a-f0-9]{7,40}$/.test(image.slice(imageBase.length))
      || (phase === 'before-execute' && image !== imageBase + identifier)) stop('IMAGE_REJECTED');
  const items = read(['run', 'jobs', 'executions', 'list', '--job=' + name, '--limit=1001'],
    'metadata.name,metadata.namespace,metadata.creationTimestamp,metadata.labels,'
    + 'status.startTime,status.completionTime,status.runningCount,status.succeededCount,'
    + 'status.failedCount,status.cancelledCount,status.conditions');
  const summary = summarizeExecutions(items, name, policy.namespace);
  const count = status.executionCount ?? 0;
  if (summary.nonterminal_or_unknown_count !== 0 || (count > 0 && !items.length)
      || items.length > count || (count > 0 && !items.some(x => x.metadata.name === status.latestCreatedExecution?.name))) {
    stop('ACTIVE_OR_UNVERIFIED_EXECUTION');
  }
  return name;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 6) stop('ARGUMENTS_REJECTED');
    const [phase, environment, identifier, stage] = process.argv.slice(2);
    if (phase === 'name') {
      const name = schemaJobName(environment, identifier, stage);
      if (environment === 'preview') validatePoolTarget(process.env);
      console.log(name);
    } else {
      checkSchemaJob(process.env, environment, identifier, stage, phase);
    }
  } catch (error) {
    console.error('STOP: ' + error.message);
    process.exitCode = 1;
  }
}
