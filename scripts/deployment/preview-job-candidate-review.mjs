#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MANIFEST = JSON.parse(readFileSync(new URL('./preview-job-review-candidates.json', import.meta.url), 'utf8'));
const MAX_EXECUTIONS = 1001;
const NAME = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const validTime = value => typeof value === 'string' && STAMP.test(value) && Number.isFinite(Date.parse(value));
const sha256 = value => createHash('sha256').update(value).digest('hex');

function invalid() { throw new Error('PREVIEW_CANDIDATE_METADATA_INVALID'); }
function safeText(value, max = 300) {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\x00-\x20\x7f]/.test(value)) invalid();
  return value;
}

export function summarizeExecutions(items, jobName, namespace) {
  if (!Array.isArray(items) || items.length >= MAX_EXECUTIONS) {
    throw new Error('PREVIEW_EXECUTION_LIST_INCOMPLETE');
  }
  const names = new Set();
  const executions = items.map(item => {
    const meta = item?.metadata;
    if (!meta || !NAME.test(meta.name) || !meta.name.startsWith(jobName + '-')
        || names.has(meta.name) || meta.namespace !== namespace
        || meta.labels?.['run.googleapis.com/job'] !== jobName
        || !validTime(meta.creationTimestamp)) invalid();
    names.add(meta.name);
    const status = item.status;
    if (!status || typeof status !== 'object' || Array.isArray(status)) invalid();
    for (const field of ['runningCount', 'succeededCount', 'failedCount', 'cancelledCount']) {
      if (status[field] !== undefined && (!Number.isSafeInteger(status[field]) || status[field] < 0)) invalid();
    }
    if (status.completionTime !== undefined && !validTime(status.completionTime)) invalid();
    if (status.startTime !== undefined && !validTime(status.startTime)) invalid();
    if (status.conditions !== undefined && !Array.isArray(status.conditions)) invalid();
    const conditions = (status.conditions ?? []).map(condition => {
      if (!condition || typeof condition.type !== 'string' || !/^[A-Za-z]+$/.test(condition.type)
          || !['True', 'False', 'Unknown'].includes(condition.status)) invalid();
      return { type: condition.type, status: condition.status };
    });
    const completed = conditions.filter(condition => condition.type === 'Completed');
    if (completed.length > 1) invalid();
    const terminal = validTime(status.completionTime)
      && ['True', 'False'].includes(completed[0]?.status)
      && (status.runningCount ?? 0) === 0;
    return {
      name: meta.name, created_at: meta.creationTimestamp,
      start_time: status.startTime ?? null, completion_time: status.completionTime ?? null,
      running_count: status.runningCount ?? 0,
      completed_condition: completed[0]?.status ?? null,
      terminal_observed: terminal,
    };
  });
  return {
    retained_execution_count: executions.length,
    nonterminal_or_unknown_count: executions.filter(item => !item.terminal_observed).length,
    executions,
  };
}

export function reviewPreviewCandidates(env = process.env, run = execFileSync, manifest = MANIFEST, onRecord = () => {}) {
  const project = env.PREVIEW_GOOGLE_CLOUD_PROJECT;
  const production = env.PRODUCTION_GOOGLE_CLOUD_PROJECT;
  if (env.DEPLOYMENT_ENVIRONMENT !== 'preview' || typeof project !== 'string'
      || !/^khedmah-preview-[a-z0-9-]+$/.test(project)
      || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)
      || typeof production !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(production)
      || project === production || project === 'khedma-dl'
      || env.GOOGLE_CLOUD_REGION !== 'europe-west1'
      || manifest.region !== 'europe-west1' || sha256(project) !== manifest.project_sha256
      || !Array.isArray(manifest.candidates) || !manifest.candidates.length || manifest.candidates.length > 20) {
    throw new Error('PREVIEW_CANDIDATE_TARGET_REJECTED');
  }
  const names = new Set();
  for (const item of manifest.candidates) {
    if (!NAME.test(item.name) || names.has(item.name) || !validTime(item.created_at)
        || !/^khedmah-(?:pr-\d+-migration|preview-(?:classifieds-025|fulfillment-026-028|taxi-pricing-029|billing-030)-[a-f0-9]{10})$/.test(item.name)) {
      throw new Error('PREVIEW_CANDIDATE_MANIFEST_INVALID');
    }
    names.add(item.name);
  }
  const started = Date.now();
  const options = {
    encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_USER_OUTPUT_ENABLED: 'true' },
  };
  const read = (args, format) => {
    if (Date.now() - started > 8 * 60 * 1000) throw new Error('PREVIEW_CANDIDATE_TIME_BOUND_EXCEEDED');
    try {
      return JSON.parse(run('gcloud', [
        ...args, '--project=' + project, '--region=europe-west1', '--user-output-enabled',
        '--format=json(' + format + ')',
      ], options));
    } catch {
      // Never emit raw cloud stderr, credential-related diagnostics or returned spec values.
      throw new Error('PREVIEW_CANDIDATE_READ_FAILED_STOP_NO_RETRY');
    }
  };
  const records = [];
  for (const candidate of manifest.candidates) {
    const job = read(['run', 'jobs', 'describe', candidate.name],
      'metadata.name,metadata.uid,metadata.namespace,metadata.creationTimestamp,metadata.labels,'
      + 'spec.template.spec.template.spec.serviceAccountName,spec.template.spec.template.spec.containers.image,'
      + 'status.executionCount');
    const meta = job?.metadata;
    if (!meta || meta.name !== candidate.name || meta.creationTimestamp !== candidate.created_at
        || !/^[0-9]+$/.test(meta.namespace) || !/^[a-f0-9-]{20,64}$/.test(meta.uid)
        || meta.labels?.['cloud.googleapis.com/location'] !== 'europe-west1') invalid();
    const spec = job.spec?.template?.spec?.template?.spec;
    if (!spec || !Array.isArray(spec.containers) || spec.containers.length !== 1) invalid();
    const image = safeText(spec.containers[0]?.image, 512);
    const serviceAccount = safeText(spec.serviceAccountName);
    if (job.status?.executionCount !== undefined && (!Number.isSafeInteger(job.status.executionCount) || job.status.executionCount < 0)) invalid();
    const executions = read(['run', 'jobs', 'executions', 'list', '--job=' + candidate.name, '--limit=' + MAX_EXECUTIONS],
      'metadata.name,metadata.namespace,metadata.creationTimestamp,metadata.labels,'
      + 'status.startTime,status.completionTime,status.runningCount,status.succeededCount,'
      + 'status.failedCount,status.cancelledCount,status.conditions');
    const executionSummary = summarizeExecutions(executions, candidate.name, meta.namespace);
    const source = image.match(/:preview-(pr-(\d+)-([a-f0-9]{7,40}))$/);
    const suffix = candidate.name.match(/-([a-f0-9]{10})$/);
    const record = {
      name: candidate.name, uid: meta.uid, namespace: meta.namespace, created_at: meta.creationTimestamp,
      observed_at: new Date().toISOString(),
      image,
      image_in_preview_project: image.startsWith('europe-west1-docker.pkg.dev/' + project + '/'),
      runtime_identity_matches_preview: typeof env.PREVIEW_RUNTIME_SERVICE_ACCOUNT === 'string'
        && serviceAccount === env.PREVIEW_RUNTIME_SERVICE_ACCOUNT,
      source_pr: source ? Number(source[2]) : null,
      source_revision: source?.[3] ?? null,
      identifier_hash_matches_name: Boolean(source && suffix && sha256(source[1]).slice(0, 10) === suffix[1]),
      lifetime_execution_count: job.status?.executionCount ?? null,
      ...executionSummary,
      ownership_review_required: true, cleanup_authorized: false,
    };
    records.push(record);
    onRecord(record);
  }
  return {
    candidate_count: records.length, project_sha256: sha256(project), region: 'europe-west1',
    configured_production_matches_canonical: production === 'khedma-dl',
    deployment_hold_required: true, cleanup_authorized: false,
    records,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = reviewPreviewCandidates(process.env, execFileSync, MANIFEST,
      record => console.log('PREVIEW_CANDIDATE_RECORD=' + JSON.stringify(record)));
    console.log('PREVIEW_CANDIDATE_SUMMARY=' + JSON.stringify({ ...result, records: undefined }));
    console.log('PREVIEW_CANDIDATE_READ_COMPLETE');
  } catch (error) {
    console.error('STOP: ' + error.message);
    process.exitCode = 1;
  }
}

