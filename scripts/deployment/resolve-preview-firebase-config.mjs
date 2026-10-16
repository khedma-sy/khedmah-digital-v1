#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validatePoolTarget } from './preview-schema-job-pool.mjs';

const PROJECT = 'khedmah-preview-v2-20261012';
const SECRET = 'FIREBASE_API_KEY';
const VERSION = '1';
const stop = code => { throw new Error('PREVIEW_FIREBASE_BINDING_' + code); };

// Resolve only an existing, pinned backend secret reference. Never retrieve values,
// change IAM, select the browser key or certify actual runtime/user authentication.
export function resolvePreviewFirebaseBinding(env, run = spawnSync) {
  if (env.DEPLOYMENT_ENVIRONMENT !== 'preview') stop('ENVIRONMENT_REJECTED');
  validatePoolTarget(env);
  if (env.GOOGLE_CLOUD_PROJECT !== PROJECT || env.ARTIFACT_REPOSITORY !== 'khedmah-preview'
      || env.RUNTIME_SERVICE_ACCOUNT !== `khedmah-pv2-runtime@${PROJECT}.iam.gserviceaccount.com`
      || env.CLOUD_SQL_INSTANCE_CONNECTION_NAME !== `${PROJECT}:europe-west1:khedmah-preview-v2-db`) {
    stop('EXECUTION_PROFILE_REJECTED');
  }
  let result;
  try {
    result = run('gcloud', ['secrets', 'versions', 'describe', VERSION, '--secret=' + SECRET,
      '--project=' + PROJECT, '--user-output-enabled', '--verbosity=error', '--format=json(name,state)'], {
      encoding: 'utf8', timeout: 45000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_DISABLE_FILE_LOGGING: 'true',
        CLOUDSDK_CORE_DISABLE_PROMPTS: 'true', CLOUDSDK_CORE_USER_OUTPUT_ENABLED: 'true' },
    });
  } catch { stop('METADATA_READ_UNCONFIRMED'); }
  if (!result || result.error || result.signal || result.status !== 0) stop('METADATA_READ_UNCONFIRMED');
  let value;
  try { value = JSON.parse(result.stdout); } catch { stop('INVALID_METADATA'); }
  const names = [PROJECT, '1044962071847'].map(p => `projects/${p}/secrets/${SECRET}/versions/${VERSION}`);
  if (!names.includes(value?.name) || value.state !== 'ENABLED') stop('PINNED_VERSION_NOT_READY');
  return `${SECRET}=${SECRET}:${VERSION}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) stop('ARGUMENTS_REJECTED');
    console.log(resolvePreviewFirebaseBinding(process.env));
  } catch (error) {
    const code = /^PREVIEW_(FIREBASE_BINDING|SCHEMA_POOL)_[A-Z_]+$/.test(error?.message ?? '')
      ? error.message : 'PREVIEW_FIREBASE_BINDING_UNEXPECTED_FAILURE';
    console.error('STOP: ' + code);
    process.exitCode = 1;
  }
}
