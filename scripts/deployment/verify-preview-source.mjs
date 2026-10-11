#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const REPO = 'khedma-sy/khedmah-digital-v1';
export function verifyPreviewSource(env, run = execFileSync) {
  const number = env.PREVIEW_PR_NUMBER, sha = env.PREVIEW_HEAD_SHA, state = env.PREVIEW_EXPECTED_PR_STATE;
  if (!/^[1-9][0-9]*$/.test(number ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '')
      || !['open', 'closed'].includes(state)) throw Error('PREVIEW_SOURCE_INPUT_REJECTED');
  let pr;
  try {
    pr = JSON.parse(run('gh', ['api', 'repos/' + REPO + '/pulls/' + number,
      '--jq', '{number,state,head_sha:.head.sha,head_repo:.head.repo.full_name}'], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env,
    }));
  } catch { throw Error('PREVIEW_SOURCE_READ_FAILED'); }
  if (pr?.number !== Number(number) || pr.state !== state || pr.head_sha !== sha || pr.head_repo !== REPO) {
    throw Error('PREVIEW_SOURCE_STALE_OR_FOREIGN_STOP');
  }
  return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { verifyPreviewSource(process.env); console.log('PREVIEW_SOURCE_CURRENT_VERIFIED'); }
  catch (error) { console.error('STOP: ' + error.message); process.exitCode = 1; }
}
