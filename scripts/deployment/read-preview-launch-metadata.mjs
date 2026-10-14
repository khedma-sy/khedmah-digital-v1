#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkSchemaJob, STAGES, validatePoolTarget } from './preview-schema-job-pool.mjs';
import { inventoryPreviewJobs } from './preview-job-inventory.mjs';
import { PREVIEW_V2_VARIABLES } from './verify-preview-v2-configuration.mjs';

export const REQUIRED_SECRETS = Object.freeze([
  'DATABASE_MIGRATION_URL', 'DATABASE_URL', 'FIREBASE_API_KEY', 'RESEND_API_KEY',
  'GOOGLE_MAPS_BROWSER_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
]);
const project = PREVIEW_V2_VARIABLES.PREVIEW_GOOGLE_CLOUD_PROJECT;
const namespace = '1044962071847';
const stop = code => { throw new Error('PREVIEW_LAUNCH_METADATA_' + code); };

// Read names, resource identity and version state only. Never fetch payloads,
// impersonate runtime identities, start jobs/builds, repair state or approve rollout.
export function readPreviewLaunchMetadata(env, run = execFileSync) {
  validatePoolTarget(env);
  if (env.DEPLOYMENT_ENVIRONMENT !== 'preview' || env.PREVIEW_GOOGLE_CLOUD_PROJECT !== project
      || env.RUNTIME_SERVICE_ACCOUNT !== PREVIEW_V2_VARIABLES.PREVIEW_V2_RUNTIME_SERVICE_ACCOUNT
      || env.ARTIFACT_REPOSITORY !== PREVIEW_V2_VARIABLES.PREVIEW_ARTIFACT_REPOSITORY
      || env.CLOUD_SQL_INSTANCE_CONNECTION_NAME !== PREVIEW_V2_VARIABLES.PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME
      || !/^pr-274-[a-f0-9]{40}$/.test(env.PREVIEW_SCHEMA_IDENTIFIER ?? '')) stop('TARGET_REJECTED');
  const options = { encoding: 'utf8', timeout: 45000, maxBuffer: 256 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, LC_ALL: 'C',
      CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_DISABLE_FILE_LOGGING: 'true',
      CLOUDSDK_CORE_DISABLE_PROMPTS: 'true', CLOUDSDK_CORE_USER_OUTPUT_ENABLED: 'true' } };
  const read = (args, fields) => {
    let raw;
    try {
      raw = run('gcloud', [...args, '--project=' + project, '--user-output-enabled',
        '--verbosity=error', '--format=json(' + fields + ')'], options);
    } catch (error) {
      const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
      return { outcome: /PERMISSION_DENIED|Permission .* denied|does not have permission/i.test(stderr) ? 'PERMISSION_DENIED'
        : /NOT_FOUND|not found|does not exist/i.test(stderr) ? 'NOT_FOUND_REPORTED' : 'READ_FAILED' };
    }
    try { return { outcome: 'OK', data: JSON.parse(raw) }; } catch { stop('INVALID_JSON'); }
  };
  const identity = read(['projects', 'describe', project], 'projectId,projectNumber,lifecycleState');
  if (identity.outcome !== 'OK' || identity.data?.projectId !== project
      || String(identity.data.projectNumber) !== namespace || identity.data.lifecycleState !== 'ACTIVE') stop('PROJECT_IDENTITY_UNCONFIRMED');
  const services = read(['run', 'services', 'list', '--region=europe-west1', '--limit=101'],
    'metadata.name,metadata.namespace,metadata.labels');
  if (services.outcome !== 'OK') stop('SERVICE_READ_UNCONFIRMED');
  if (!Array.isArray(services.data) || services.data.length >= 101
      || services.data.some(x => !/^[a-z][a-z0-9-]{0,62}$/.test(x?.metadata?.name ?? '')
        || x.metadata.namespace !== namespace || x.metadata.labels?.['cloud.googleapis.com/location'] !== 'europe-west1')
      || new Set(services.data.map(x => x.metadata.name)).size !== services.data.length) stop('SERVICE_INVENTORY_INVALID');
  const secrets = [];
  for (const secret of REQUIRED_SECRETS) {
    const versions = {};
    for (const selector of ['1', 'latest']) {
      const result = read(['secrets', 'versions', 'describe', selector, '--secret=' + secret], 'name,state');
      if (result.outcome !== 'OK') { versions[selector] = result; continue; }
      const parents = [project, namespace].map(p => `projects/${p}/secrets/${secret}/versions/`);
      const parent = parents.find(p => typeof result.data?.name === 'string' && result.data.name.startsWith(p));
      const version = parent && result.data.name.slice(parent.length);
      if (!/^[1-9][0-9]*$/.test(version ?? '') || !['ENABLED','DISABLED','DESTROYED'].includes(result.data.state)
          || (selector === '1' && version !== '1')) stop('SECRET_METADATA_INVALID');
      versions[selector] = { outcome: 'OK', version, state: result.data.state };
    }
    secrets.push({ secret, versions, staged_version_1_enabled_and_latest: Object.values(versions)
      .every(v => v.outcome === 'OK' && v.version === '1' && v.state === 'ENABLED') });
  }
  const inventory = inventoryPreviewJobs(options.env, run);
  const slots = Object.keys(STAGES).map(stage => ({ stage,
    job: checkSchemaJob(options.env, 'preview', env.PREVIEW_SCHEMA_IDENTIFIER, stage, 'before-deploy', run),
    before_deploy_check_passed: true }));
  return { evidence_utc: new Date().toISOString(), project, project_number: namespace,
    service_count: services.data.length, service_names: services.data.map(x => x.metadata.name).sort(),
    required_secrets: secrets, job_inventory: inventory, schema_slots: slots,
    completed_secret_metadata_matches: secrets.every(x => x.staged_version_1_enabled_and_latest),
    cloud_mutation: false, secret_payload_access: false, database_access: false,
    runtime_access_verified: false, deployment_readiness_verified: false, deployment_held: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) stop('ARGUMENTS_REJECTED');
    const report = readPreviewLaunchMetadata(process.env);
    console.log('PREVIEW_LAUNCH_METADATA=' + JSON.stringify(report));
    if (!report.completed_secret_metadata_matches) stop('SECRET_BASELINE_UNCONFIRMED');
    console.log('PREVIEW_LAUNCH_METADATA_READ_COMPLETE_NOT_A_READINESS_VERDICT');
  } catch (error) {
    const message = /^PREVIEW_(LAUNCH_METADATA|SCHEMA_POOL|JOB_INVENTORY)_[A-Z_]+$/.test(error?.message ?? '')
      ? error.message : 'PREVIEW_LAUNCH_METADATA_READ_FAILED';
    console.error('STOP: ' + message);
    process.exitCode = 1;
  }
}
