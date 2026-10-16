#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DIAGNOSTIC_PARENT = '1a7deaf926b0b5060c2f6f27e1f828229569b94d';
export const REVIEWED_MAIN = 'bc5a5c764413498189147cc34c7e857c78aa3d2c';
export const DIAGNOSTIC_MESSAGE = 'chore(preview): verify source-bucket grant as deployer';
const repo = 'khedma-sy/khedmah-digital-v1';
const stop = code => { throw new Error('PREVIEW_BUILD_SOURCE_DIAGNOSTIC_' + code); };

export function verifyDiagnosticSource(env, run = execFileSync) {
  if (env.GITHUB_REPOSITORY !== repo || env.GITHUB_EVENT_NAME !== 'pull_request'
      || env.GITHUB_REF !== 'refs/pull/274/merge' || env.PREVIEW_EVENT_ACTION !== 'synchronize'
      || env.GITHUB_RUN_ATTEMPT !== '1' || env.PREVIEW_PR_NUMBER !== '274'
      || !/^[a-f0-9]{40}$/.test(env.PREVIEW_HEAD_SHA ?? '')) stop('CONTEXT_HELD');
  const read = path => {
    try {
      return JSON.parse(run('gh', ['api', '--hostname', 'github.com', 'repos/' + repo + path], {
        encoding: 'utf8', timeout: 30000, maxBuffer: 512 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'], env,
      }));
    } catch { stop('SOURCE_READ_HELD'); }
  };
  const commit = read('/git/commits/' + env.PREVIEW_HEAD_SHA);
  if (commit.sha !== env.PREVIEW_HEAD_SHA || commit.parents?.length !== 1
      || commit.parents[0].sha !== DIAGNOSTIC_PARENT
      || commit.message?.trim() !== DIAGNOSTIC_MESSAGE) stop('LINEAGE_HELD');
  const pr = read('/pulls/274');
  if (pr.number !== 274 || pr.state !== 'open' || pr.merged !== false
      || pr.head?.sha !== env.PREVIEW_HEAD_SHA || pr.head?.repo?.full_name !== repo
      || pr.base?.ref !== 'main' || pr.base?.repo?.full_name !== repo) stop('PR_HELD');
  const main = read('/branches/main');
  if (main.commit?.sha !== REVIEWED_MAIN) stop('MAIN_CHANGED_HELD');
  return { parent: DIAGNOSTIC_PARENT, diagnostic_head: env.PREVIEW_HEAD_SHA,
    first_attempt_only: true, metadata_only: true, grant_readback_only: true,
    rollout_authorized: false, cloud_mutation: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) stop('ARGUMENTS_HELD');
    console.log('PREVIEW_BUILD_SOURCE_DIAGNOSTIC_SOURCE=' + JSON.stringify(verifyDiagnosticSource(process.env)));
  } catch (error) {
    console.error('STOP: ' + (/^PREVIEW_[A-Z_]+$/.test(error?.message ?? '')
      ? error.message : 'PREVIEW_BUILD_SOURCE_DIAGNOSTIC_UNCONFIRMED_HELD'));
    process.exitCode = 1;
  }
}
