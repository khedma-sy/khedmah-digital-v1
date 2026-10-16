#!/usr/bin/env node
// Owner-operated GitHub environment correction; never invoked by a workflow.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const IDENTITY_NAMES = ['PRODUCTION_GOOGLE_CLOUD_PROJECT', 'PRODUCTION_FIREBASE_PROJECT_ID'];
export const IDENTITY_CONFIRMATION = 'RECONCILE_PREVIEW_PRODUCTION_IDENTITIES';
const BASE = 'repos/khedma-sy/khedmah-digital-v1/environments/preview/variables/';
const OLD_SHA256 = '6ea5e44c1e7542be7a78adc6ae8f37b0ce265846aa87a648110ee03a4d6cf5bf';
const hash = value => createHash('sha256').update(value).digest('hex');
const stop = code => { throw new Error('PREVIEW_IDENTITY_' + code); };

export function reconcilePreviewIdentities(mode, confirmation, run = execFileSync, emit = () => {}, oldHash = OLD_SHA256) {
  if (!['plan', 'apply'].includes(mode) || (mode === 'apply' && confirmation !== IDENTITY_CONFIRMATION)) stop('CONFIRMATION_REQUIRED');
  const options = { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GH_DEBUG: '' } };
  const read = name => {
    let r;
    try { r = JSON.parse(run('gh', ['api', '--hostname', 'github.com', BASE + name], options)); }
    catch { stop('READ_FAILED_STOP'); }
    if (r?.name !== name || typeof r.value !== 'string' || !Number.isFinite(Date.parse(r.updated_at))
        || (r.value !== 'khedma-dl' && hash(r.value) !== oldHash)) stop('UNREVIEWED_VALUE_STOP');
    return { name: r.name, value: r.value, updated_at: r.updated_at };
  };
  const before = IDENTITY_NAMES.map(read);
  emit('PREVIEW_IDENTITY_PLAN=' + JSON.stringify(before.map(r => ({ name: r.name,
    environment: 'preview', before: r.value, after: 'khedma-dl', change_required: r.value !== 'khedma-dl' }))));
  if (mode === 'plan') return before;
  for (const original of before) {
    const fresh = read(original.name);
    if (JSON.stringify(fresh) !== JSON.stringify(original)) stop('CONCURRENT_CHANGE_STOP');
    if (fresh.value === 'khedma-dl') continue;
    emit('STAGE_ATTEMPT=PREVIEW_IDENTITY:' + fresh.name);
    try {
      run('gh', ['api', '--hostname', 'github.com', '--method', 'PATCH', BASE + fresh.name,
        '--raw-field', 'name=' + fresh.name, '--raw-field', 'value=khedma-dl'], options);
    } catch { stop('PATCH_UNCONFIRMED_STOP_NO_RETRY'); }
    if (read(fresh.name).value !== 'khedma-dl') stop('PATCH_READBACK_FAILED_STOP');
    emit('STAGE_DONE=PREVIEW_IDENTITY:' + fresh.name);
  }
  const after = IDENTITY_NAMES.map(read);
  if (after.some(r => r.value !== 'khedma-dl')) stop('FINAL_READBACK_FAILED_STOP');
  emit('PREVIEW_PRODUCTION_IDENTITIES_RECONCILED');
  emit('DEPLOYMENT_HOLD_UNCHANGED_NO_CLOUD_MUTATION');
  return after;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--plan') reconcilePreviewIdentities('plan', null, execFileSync, console.log);
    else if (args.length === 2 && args[0] === '--apply') reconcilePreviewIdentities('apply', args[1], execFileSync, console.log);
    else stop('USAGE_PLAN_OR_APPLY_CONFIRMATION_REQUIRED');
  } catch (error) { console.error('STOP: ' + error.message); process.exitCode = 1; }
}
