#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validatePoolTarget } from './preview-schema-job-pool.mjs';

const SECRET = 'RESEND_API_KEY';
const PERMISSIONS = ['secretmanager.secrets.get', 'secretmanager.versions.list', 'secretmanager.versions.get'];
const STATES = ['ENABLED', 'DISABLED', 'DESTROYED'];
const stop = code => { throw new Error('PREVIEW_MAIL_METADATA_' + code); };

// Only fixed metadata commands are accepted. Raw stdout/stderr and secret payloads
// never become evidence. A denied read cannot prove that the secret is absent.
export function readPreviewMailMetadata(env, run = spawnSync, policy) {
  if (env.DEPLOYMENT_ENVIRONMENT !== 'preview') stop('ENVIRONMENT_REJECTED');
  validatePoolTarget(env, policy);
  const project = env.GOOGLE_CLOUD_PROJECT;
  const namespace = policy?.namespace ?? '1044962071847';
  const parents = [project, namespace].map(p => `projects/${p}/secrets/${SECRET}`);
  const versionNumber = name => {
    if (typeof name !== 'string') return null;
    const parent = parents.find(p => name.startsWith(p + '/versions/'));
    const value = parent && name.slice(parent.length + '/versions/'.length);
    return /^[1-9][0-9]*$/.test(value ?? '') ? value : null;
  };
  const definitions = [
    { key: 'secret', args: ['secrets', 'describe', SECRET], fields: 'name',
      parse: data => parents.includes(data?.name) ? { outcome: 'OK', exists: true } : null },
    { key: 'enabled_version', args: ['secrets', 'versions', 'list', SECRET, '--filter=state=ENABLED', '--limit=1'], fields: 'name,state',
      parse: data => Array.isArray(data) && data.length <= 1 && data.every(x => versionNumber(x?.name) && x.state === 'ENABLED')
        ? { outcome: 'OK', enabled_version_present: data.length === 1 } : null },
    { key: 'latest', args: ['secrets', 'versions', 'describe', 'latest', '--secret=' + SECRET], fields: 'name,state',
      parse: data => versionNumber(data?.name) && STATES.includes(data.state)
        ? { outcome: 'OK', version: versionNumber(data.name), state: data.state } : null },
  ];
  const reads = {};
  for (const definition of definitions) {
    let result;
    try {
      result = run('gcloud', [...definition.args, '--project=' + project, '--user-output-enabled',
        '--verbosity=error', '--format=json(' + definition.fields + ')'], {
        encoding: 'utf8', timeout: 45000, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...env, LC_ALL: 'C', CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_USER_OUTPUT_ENABLED: 'true',
          CLOUDSDK_CORE_DISABLE_PROMPTS: 'true' },
      });
    } catch { stop('LOCAL_COMMAND_FAILED'); }
    if (!result || result.error || result.signal || !Number.isInteger(result.status)) stop('LOCAL_COMMAND_FAILED');
    if (result.status !== 0) {
      const error = typeof result.stderr === 'string' ? result.stderr : '';
      const outcome = /SERVICE_DISABLED|API has not been used|API .*disabled/i.test(error) ? 'API_UNAVAILABLE'
        : /PERMISSION_DENIED|Permission .* denied|does not have permission/i.test(error) ? 'PERMISSION_DENIED'
        : /NOT_FOUND|not found|does not exist/i.test(error) ? 'NOT_FOUND_REPORTED'
        : /UNAUTHENTICATED|invalid authentication credentials|no active account/i.test(error) ? 'AUTHENTICATION_FAILED'
        : 'UNCLASSIFIED_READ_FAILURE';
      const reported_permissions = PERMISSIONS.filter(p => error.includes(p));
      reads[definition.key] = { outcome, reported_permissions };
      continue;
    }
    let data;
    try { data = JSON.parse(result.stdout); } catch { stop('INVALID_METADATA'); }
    const parsed = definition.parse(data);
    if (!parsed) stop('INVALID_METADATA');
    reads[definition.key] = parsed;
  }
  const secret_visible = reads.secret.outcome === 'OK' || reads.latest.outcome === 'OK'
    || reads.enabled_version.enabled_version_present === true;
  return { evidence_utc: new Date().toISOString(), secret: SECRET, secret_visible,
    existence_unconfirmed: !secret_visible, reads, cloud_mutation: false, secret_payload_access: false,
    runtime_access_verified: false, email_delivery_verified: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) stop('ARGUMENTS_REJECTED');
    console.log('PREVIEW_MAIL_METADATA=' + JSON.stringify(readPreviewMailMetadata(process.env)));
    console.log('PREVIEW_MAIL_DIAGNOSTIC_COMPLETE_NO_MUTATION');
  } catch (error) {
    const code = /^PREVIEW_(MAIL_METADATA|SCHEMA_POOL)_[A-Z_]+$/.test(error?.message ?? '')
      ? error.message : 'PREVIEW_MAIL_METADATA_UNEXPECTED_FAILURE';
    console.error('STOP: ' + code);
    process.exitCode = 1;
  }
}
