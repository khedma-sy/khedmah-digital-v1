#!/usr/bin/env node
// Prepared for a separately approved cleanup. No workflow invokes this operator.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { reviewPreviewCandidates } from './preview-job-candidate-review.mjs';

const MANIFEST = JSON.parse(readFileSync(new URL('./preview-job-cleanup-20261011.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const executionsDigest = values => digest([...values].sort((a, b) => a.name.localeCompare(b.name)));
const REPO = 'khedma-sy/khedmah-digital-v1';
const stop = code => { throw new Error('PREVIEW_CLEANUP_' + code); };
export const confirmationFor = manifest => 'DELETE_KHEDMAH_PREVIEW_' + manifest.candidates.length + '_' + digest(manifest).slice(0, 16);

export function cleanupPreviewJobs(env, run, manifest, confirmation, emit = () => {}) {
  if (manifest?.schema !== 1 || !Array.isArray(manifest.candidates)
      || manifest.candidates.length < 1 || manifest.candidates.length > 20) stop('MANIFEST_INVALID');
  if (confirmation !== confirmationFor(manifest)) stop('APPROVAL_REQUIRED');
  // The reader validates the exact project digest, both Production exclusions,
  // region, candidate names and creation timestamps before any cloud read.
  for (const c of manifest.candidates) {
    if (!/^[a-f0-9-]{20,64}$/.test(c.uid) || !/^[0-9]+$/.test(c.namespace)
        || !/^[a-f0-9]{64}$/.test(c.image_sha256) || !/^[a-f0-9]{64}$/.test(c.executions_sha256)
        || !Number.isSafeInteger(c.source_pr) || c.source_pr < 1
        || !/^[a-f0-9]{40}$/.test(c.source_revision) || !Number.isFinite(Date.parse(c.pr_closed_at))
        || !Number.isSafeInteger(c.lifetime_execution_count) || c.lifetime_execution_count < 1
        || c.retained_execution_count !== c.lifetime_execution_count) stop('MANIFEST_INVALID');
  }
  const options = { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_USER_OUTPUT_ENABLED: 'true' } };
  const readPR = c => {
    let p;
    try {
      p = JSON.parse(run('gh', ['api', 'repos/' + REPO + '/pulls/' + c.source_pr,
        '--jq', '{number,state,closed_at}'], options));
    } catch { stop('PR_READ_FAILED'); }
    if (p?.number !== c.source_pr || p.state !== 'closed' || p.closed_at !== c.pr_closed_at) stop('PR_STATE_CHANGED');
  };
  const validate = records => {
    if (records.length !== manifest.candidates.length) stop('READBACK_INCOMPLETE');
    for (const r of records) {
      const c = manifest.candidates.find(c => c.name === r.name);
      if (!c || r.uid !== c.uid || r.namespace !== c.namespace || r.created_at !== c.created_at
          || hash(r.image) !== c.image_sha256 || r.source_pr !== c.source_pr || r.source_revision !== c.source_revision
          || !r.image_in_preview_project || !r.runtime_identity_matches_preview
          || (!r.identifier_hash_matches_name && r.name !== 'khedmah-pr-' + r.source_pr + '-migration')
          || r.lifetime_execution_count !== c.lifetime_execution_count
          || r.retained_execution_count !== c.retained_execution_count
          || r.nonterminal_or_unknown_count !== 0
          || executionsDigest(r.executions) !== c.executions_sha256) stop('LIVE_STATE_CHANGED');
    }
  };
  const preflight = reviewPreviewCandidates(env, run, manifest);
  validate(preflight.records);
  for (const c of manifest.candidates.filter((c, i, a) => a.findIndex(x => x.source_pr === c.source_pr) === i)) readPR(c);
  emit('PREVIEW_CLEANUP_PREFLIGHT_PASSED_COUNT=' + manifest.candidates.length);
  const deleted = [];
  for (const c of manifest.candidates) {
    readPR(c);
    const single = { ...manifest, candidates: [c] };
    const fresh = reviewPreviewCandidates(env, run, single).records;
    // Reuse the complete-manifest validator without weakening its count check.
    validate(preflight.records.map(r => r.name === c.name ? fresh[0] : r));
    if (fresh.length !== 1 || Date.now() - Date.parse(fresh[0].observed_at) > 10000) stop('FRESH_READ_REQUIRED');
    emit('STAGE_ATTEMPT=DELETE_PREVIEW_JOB:' + c.name);
    try {
      run('gcloud', ['run', 'jobs', 'delete', c.name,
        '--project=' + env.PREVIEW_GOOGLE_CLOUD_PROJECT, '--region=europe-west1', '--quiet'], options);
    } catch { stop('DELETE_UNCONFIRMED_STOP_NO_RETRY'); }
    deleted.push(c.name);
    emit('STAGE_DONE=DELETE_PREVIEW_JOB:' + c.name);
  }
  let remaining;
  try {
    remaining = JSON.parse(run('gcloud', ['run', 'jobs', 'list',
      '--project=' + env.PREVIEW_GOOGLE_CLOUD_PROJECT, '--region=europe-west1',
      '--limit=2000', '--user-output-enabled', '--format=json(metadata.name)'], options));
  } catch { stop('POST_READ_FAILED'); }
  if (!Array.isArray(remaining) || remaining.length >= 2000
      || remaining.some(r => typeof r?.metadata?.name !== 'string')
      || new Set(remaining.map(r => r.metadata.name)).size !== remaining.length
      || remaining.some(r => deleted.includes(r.metadata.name))) stop('POST_READ_UNVERIFIED');
  emit('PREVIEW_CLEANUP_VERIFIED=' + JSON.stringify({ deleted_count: deleted.length, remaining_job_count: remaining.length }));
  return deleted;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--confirm') stop('APPROVAL_REQUIRED');
    cleanupPreviewJobs(process.env, execFileSync, MANIFEST, process.argv[3], console.log);
  } catch (error) {
    console.error('STOP: ' + error.message);
    process.exitCode = 1;
  }
}
