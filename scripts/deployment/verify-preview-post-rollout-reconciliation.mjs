#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const RECONCILIATION_PARENT = '5de460744f50e0571aea33df02e528105ca593de';
export const RECONCILIATION_MESSAGE = 'chore(preview): diagnose rollout metadata mismatch read-only';
export const REVIEWED_MAIN = 'bc5a5c764413498189147cc34c7e857c78aa3d2c';
export const ROLLOUT_SOURCE = '676e3a8d97ed09e8335ceee2b547a5247f28be6b';
export const ROLLOUT_SOURCE_PARENT = '3cdb0ad2e7e67e1e9d8f1062ac69b0cb9d5172ed';
export const ROLLOUT_MERGE = '81cd97479040774cc36fb720cdb6f948348302dd';
export const ROLLOUT_RUN_ID = 38609320607;
export const ROLLOUT_DEPLOY_JOB_ID = 116011073615;
export const FAILED_RECONCILIATION_RUN_ID = 38622535259;
export const FAILED_RECONCILIATION_JOB_ID = 116053404169;

const REPO = 'khedma-sy/khedmah-digital-v1';
const ROLLOUT_MESSAGE = 'release(preview): execute reviewed rollout after source grant';
const MERGE_MESSAGE = `Merge ${ROLLOUT_SOURCE} into ${REVIEWED_MAIN}`;
const stop = code => { throw new Error('PREVIEW_POST_ROLLOUT_SOURCE_' + code); };

function sameParents(value, expected) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((item, index) => item?.sha === expected[index]);
}

// This gate runs before WIF. It binds one direct-successor source to the immutable
// completed rollout receipts. The workflow itself failed; only its deploy-preview
// job is asserted successful. No rerun, dispatch or cloud action is authorized.
export function verifyPostRolloutSource(env, run = execFileSync) {
  if (env.GITHUB_REPOSITORY !== REPO || env.GITHUB_EVENT_NAME !== 'pull_request'
      || env.GITHUB_REF !== 'refs/pull/274/merge' || env.PREVIEW_EVENT_ACTION !== 'synchronize'
      || env.GITHUB_RUN_ATTEMPT !== '1' || env.PREVIEW_PR_NUMBER !== '274'
      || !/^[a-f0-9]{40}$/.test(env.PREVIEW_HEAD_SHA ?? '')) stop('CONTEXT_HELD');

  const read = path => {
    try {
      return JSON.parse(run('gh', ['api', '--hostname', 'github.com', `repos/${REPO}${path}`], {
        encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'], env,
      }));
    } catch { stop('GITHUB_READ_HELD'); }
  };

  const source = read('/git/commits/' + env.PREVIEW_HEAD_SHA);
  if (source.sha !== env.PREVIEW_HEAD_SHA
      || !sameParents(source.parents, [RECONCILIATION_PARENT])
      || source.message?.trim() !== RECONCILIATION_MESSAGE) stop('LINEAGE_HELD');

  const pr = read('/pulls/274');
  if (pr.number !== 274 || pr.state !== 'open' || pr.merged !== false
      || pr.head?.sha !== env.PREVIEW_HEAD_SHA || pr.head?.repo?.full_name !== REPO
      || pr.base?.ref !== 'main' || pr.base?.repo?.full_name !== REPO) stop('PR_HELD');

  const main = read('/branches/main');
  if (main.commit?.sha !== REVIEWED_MAIN) stop('MAIN_CHANGED_HELD');

  const rollout = read('/git/commits/' + ROLLOUT_SOURCE);
  if (rollout.sha !== ROLLOUT_SOURCE || !sameParents(rollout.parents, [ROLLOUT_SOURCE_PARENT])
      || rollout.message?.trim() !== ROLLOUT_MESSAGE) stop('ROLLOUT_SOURCE_HELD');

  const merge = read('/git/commits/' + ROLLOUT_MERGE);
  if (merge.sha !== ROLLOUT_MERGE || merge.message?.trim() !== MERGE_MESSAGE
      || !sameParents(merge.parents, [REVIEWED_MAIN, ROLLOUT_SOURCE])) stop('ROLLOUT_MERGE_HELD');

  const workflow = read('/actions/runs/' + ROLLOUT_RUN_ID);
  if (workflow.id !== ROLLOUT_RUN_ID || workflow.name !== 'PR Preview'
      || workflow.event !== 'pull_request' || workflow.status !== 'completed'
      || workflow.conclusion !== 'failure' || workflow.run_attempt !== 1
      || workflow.head_sha !== ROLLOUT_SOURCE
      || workflow.path !== '.github/workflows/preview-deployment.yml'
      || workflow.head_repository?.full_name !== REPO
      || !Array.isArray(workflow.pull_requests) || workflow.pull_requests.length !== 1
      || workflow.pull_requests[0]?.number !== 274) stop('ROLLOUT_RUN_HELD');

  const deploy = read('/actions/jobs/' + ROLLOUT_DEPLOY_JOB_ID);
  if (deploy.id !== ROLLOUT_DEPLOY_JOB_ID || deploy.run_id !== ROLLOUT_RUN_ID
      || deploy.name !== 'deploy-preview' || deploy.status !== 'completed'
      || deploy.conclusion !== 'success'
      || !Array.isArray(deploy.steps)
      || !deploy.steps.some(step => step.name === 'Deploy isolated PR services'
        && step.status === 'completed' && step.conclusion === 'success')) stop('ROLLOUT_DEPLOY_JOB_HELD');

  const failedRun = read('/actions/runs/' + FAILED_RECONCILIATION_RUN_ID);
  if (failedRun.id !== FAILED_RECONCILIATION_RUN_ID || failedRun.name !== 'PR Preview'
      || failedRun.event !== 'pull_request' || failedRun.status !== 'completed'
      || failedRun.conclusion !== 'failure' || failedRun.run_attempt !== 1
      || failedRun.head_sha !== RECONCILIATION_PARENT
      || failedRun.path !== '.github/workflows/preview-deployment.yml'
      || failedRun.head_repository?.full_name !== REPO
      || !Array.isArray(failedRun.pull_requests) || failedRun.pull_requests.length !== 1
      || failedRun.pull_requests[0]?.number !== 274) stop('FAILED_RECONCILIATION_RUN_HELD');

  const failedJob = read('/actions/jobs/' + FAILED_RECONCILIATION_JOB_ID);
  const exactStep = name => failedJob.steps?.find(step => step.name === name);
  if (failedJob.id !== FAILED_RECONCILIATION_JOB_ID
      || failedJob.run_id !== FAILED_RECONCILIATION_RUN_ID
      || failedJob.name !== 'reconcile-successful-rollout'
      || failedJob.status !== 'completed' || failedJob.conclusion !== 'failure'
      || exactStep('Verify the exact post-rollout reconciliation source before authentication')?.conclusion !== 'success'
      || exactStep('Run google-github-actions/auth@v3')?.conclusion !== 'success'
      || exactStep('Read exact successful Preview rollout metadata and anonymous HTTP')?.conclusion !== 'failure') {
    stop('FAILED_RECONCILIATION_JOB_HELD');
  }

  return {
    reconciliation_parent: RECONCILIATION_PARENT,
    reconciliation_head: env.PREVIEW_HEAD_SHA,
    rollout_source: ROLLOUT_SOURCE,
    rollout_merge: ROLLOUT_MERGE,
    rollout_run_id: ROLLOUT_RUN_ID,
    rollout_run_conclusion: 'failure',
    rollout_deploy_job_id: ROLLOUT_DEPLOY_JOB_ID,
    rollout_deploy_job_conclusion: 'success',
    failed_reconciliation_run_id: FAILED_RECONCILIATION_RUN_ID,
    failed_reconciliation_job_id: FAILED_RECONCILIATION_JOB_ID,
    diagnostic_only: true,
    first_attempt_only: true,
    read_only_reconciliation: true,
    rollout_retry_authorized: false,
    cleanup_authorized: false,
    production_access_authorized: false,
    cloud_mutation: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) stop('ARGUMENTS_HELD');
    console.log('PREVIEW_POST_ROLLOUT_SOURCE=' + JSON.stringify(verifyPostRolloutSource(process.env)));
  } catch (error) {
    console.error('STOP: ' + (/^PREVIEW_POST_ROLLOUT_SOURCE_[A-Z_]+$/.test(error?.message ?? '')
      ? error.message : 'PREVIEW_POST_ROLLOUT_SOURCE_UNCONFIRMED_HELD'));
    process.exitCode = 1;
  }
}
