#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readPreviewLaunchMetadata } from './read-preview-launch-metadata.mjs';

// This approval is confined to the first direct successor of the verified
// metadata source. Later documentation/source commits and reruns stay held.
export const REVIEWED_PARENT = 'bee5489736287901d2dd1a3fe63193426e3ffa56';
export const REVIEWED_MAIN = 'bc5a5c764413498189147cc34c7e857c78aa3d2c';
export const RELEASE_MESSAGE = 'release(preview): execute reviewed first replacement rollout';
const repo = 'khedma-sy/khedmah-digital-v1';
const stop = code => { throw new Error('PREVIEW_FIRST_ROLLOUT_' + code); };
export function verifyFirstRolloutSource(env, run = execFileSync) {
  if (env.GITHUB_REPOSITORY !== repo || env.GITHUB_EVENT_NAME !== 'pull_request'
      || env.GITHUB_REF !== 'refs/pull/274/merge' || env.PREVIEW_EVENT_ACTION !== 'synchronize'
      || env.GITHUB_RUN_ATTEMPT !== '1' || env.PREVIEW_PR_NUMBER !== '274'
      || !/^[a-f0-9]{40}$/.test(env.PREVIEW_HEAD_SHA ?? '')) stop('CONTEXT_HELD');
  const read = path => {
    try { return JSON.parse(run('gh', ['api', '--hostname', 'github.com', 'repos/' + repo + path], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 512 * 1024, stdio: ['ignore','pipe','pipe'], env,
    })); } catch { stop('SOURCE_READ_HELD'); }
  };
  const commit = read('/git/commits/' + env.PREVIEW_HEAD_SHA);
  if (commit.sha !== env.PREVIEW_HEAD_SHA || commit.parents?.length !== 1
      || commit.parents[0].sha !== REVIEWED_PARENT || commit.message?.trim() !== RELEASE_MESSAGE) stop('LINEAGE_HELD');
  const pr = read('/pulls/274');
  if (pr.number !== 274 || pr.state !== 'open' || pr.merged !== false
      || pr.head?.sha !== env.PREVIEW_HEAD_SHA || pr.head?.repo?.full_name !== repo
      || pr.base?.ref !== 'main' || pr.base?.repo?.full_name !== repo) stop('PR_HELD');
  const main = read('/branches/main');
  if (main.commit?.sha !== REVIEWED_MAIN) stop('MAIN_CHANGED_HELD');
  return { reviewed_parent: REVIEWED_PARENT, release_head: env.PREVIEW_HEAD_SHA,
    first_attempt_only: true, source_review_passed: true, cloud_mutation: false };
}
export function requireEmptyFirstRolloutInventory(report) {
  if (report?.project !== 'khedmah-preview-v2-20261012' || report.project_number !== '1044962071847'
      || report.service_count !== 0 || report.service_names?.length !== 0
      || report.job_inventory?.job_count !== 0 || report.job_inventory?.oldest_jobs?.length !== 0
      || report.completed_secret_metadata_matches !== true || report.required_secrets?.length !== 11
      || report.required_secrets.some(x => x.staged_version_1_enabled_and_latest !== true)
      || report.schema_slots?.length !== 9 || report.schema_slots.some(x => x.before_deploy_check_passed !== true)
      || report.cloud_mutation !== false || report.secret_payload_access !== false || report.database_access !== false) stop('INVENTORY_HELD');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) stop('ARGUMENTS_HELD');
    if (process.argv[2] === '--source') {
      console.log('PREVIEW_FIRST_ROLLOUT_SOURCE=' + JSON.stringify(verifyFirstRolloutSource(process.env)));
    } else if (process.argv[2] === '--inventory') {
      // Recheck lineage immediately before fresh cloud inventory; no stale saved receipt.
      verifyFirstRolloutSource(process.env);
      const report = readPreviewLaunchMetadata(process.env);
      console.log('PREVIEW_LAUNCH_METADATA=' + JSON.stringify(report));
      requireEmptyFirstRolloutInventory(report);
      console.log('PREVIEW_FIRST_ROLLOUT_EMPTY_INVENTORY_VERIFIED');
    } else stop('ARGUMENTS_HELD');
  } catch (error) {
    console.error('STOP: ' + (/^PREVIEW_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'PREVIEW_FIRST_ROLLOUT_UNCONFIRMED_HELD'));
    process.exitCode = 1;
  }
}
