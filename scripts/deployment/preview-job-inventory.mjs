#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REGION = 'europe-west1';
const MAX_JOBS = 2000;

export function inventoryPreviewJobs(env = process.env, run = execFileSync) {
  // Select the project from the already-validated Preview environment configuration.
  const project = env.PREVIEW_GOOGLE_CLOUD_PROJECT;
  const configuredProduction = env.PRODUCTION_GOOGLE_CLOUD_PROJECT;
  if (env.DEPLOYMENT_ENVIRONMENT !== 'preview'
      || typeof project !== 'string'
      || !/^khedmah-preview-[a-z0-9-]+$/.test(project)
      || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)
      || typeof configuredProduction !== 'string'
      || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(configuredProduction)
      || project === configuredProduction
      || project === 'khedma-dl'
      || env.GOOGLE_CLOUD_REGION !== REGION
  ) {
    throw new Error('PREVIEW_INVENTORY_TARGET_REJECTED');
  }
  let jobs;
  try {
    const raw = run('gcloud', [
      'run', 'jobs', 'list', '--project=' + project, '--region=' + REGION,
      '--limit=' + MAX_JOBS, '--user-output-enabled',
      '--format=json(metadata.name,metadata.creationTimestamp,metadata.labels)',
    ], {
      encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_USER_OUTPUT_ENABLED: 'true' },
    });
    jobs = JSON.parse(raw);
  } catch {
    throw new Error('PREVIEW_INVENTORY_READ_FAILED');
  }
  if (!Array.isArray(jobs) || jobs.length >= MAX_JOBS) {
    throw new Error('PREVIEW_INVENTORY_INCOMPLETE');
  }
  const names = new Set();
  const records = jobs.map(job => {
    const metadata = job?.metadata;
    if (!metadata || typeof metadata.name !== 'string'
        || !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(metadata.name)
        || names.has(metadata.name)
        || typeof metadata.creationTimestamp !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(metadata.creationTimestamp)
        || !Number.isFinite(Date.parse(metadata.creationTimestamp))) {
      throw new Error('PREVIEW_INVENTORY_METADATA_INVALID');
    }
    names.add(metadata.name);
    const labels = metadata.labels ?? {};
    if (!labels || typeof labels !== 'object' || Array.isArray(labels)
        || Object.entries(labels).some(([key, value]) => key.length > 256
          || typeof value !== 'string' || value.length > 256)) {
      throw new Error('PREVIEW_INVENTORY_METADATA_INVALID');
    }
    return { name: metadata.name, created_at: metadata.creationTimestamp, labels };
  });
  records.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    || a.name.localeCompare(b.name));
  return {
    project, region: REGION, job_count: records.length,
    oldest_jobs: records.slice(0, 20),
    configured_production_matches_canonical: configuredProduction === 'khedma-dl',
    deployment_hold_required: true,
    execution_state_reviewed: false,
    cleanup_authorized: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(inventoryPreviewJobs(), null, 2));
    console.log('PREVIEW_JOB_METADATA_READ_COMPLETE');
  } catch (error) {
    console.error('STOP: ' + error.message);
    process.exitCode = 1;
  }
}
