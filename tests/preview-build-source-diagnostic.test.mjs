import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyDiagnosticSource, DIAGNOSTIC_PARENT, REVIEWED_MAIN, DIAGNOSTIC_MESSAGE } from '../scripts/deployment/verify-preview-build-source-diagnostic.mjs';

const repo='khedma-sy/khedmah-digital-v1',head='a'.repeat(40);
const env={GITHUB_REPOSITORY:repo,GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/274/merge',PREVIEW_EVENT_ACTION:'synchronize',GITHUB_RUN_ATTEMPT:'1',PREVIEW_PR_NUMBER:'274',PREVIEW_HEAD_SHA:head};
const commit={sha:head,parents:[{sha:DIAGNOSTIC_PARENT}],message:DIAGNOSTIC_MESSAGE};
const pr={number:274,state:'open',merged:false,head:{sha:head,repo:{full_name:repo}},base:{ref:'main',repo:{full_name:repo}}};
const main={commit:{sha:REVIEWED_MAIN}};
const runner=(responses,calls=[]) => (tool,args,options) => {
  calls.push(args); assert.equal(tool,'gh'); assert.equal(args[0],'api');
  assert.ok(!args.includes('--method')); assert.equal(options.timeout,30000);
  return JSON.stringify(responses.shift());
};

test('diagnostic accepts only the reviewed direct successor and current PR/main',()=>{
  const calls=[]; const result=verifyDiagnosticSource(env,runner([commit,pr,main],calls));
  assert.equal(calls.length,3); assert.equal(result.diagnostic_head,head);
  assert.equal(result.metadata_only,true); assert.equal(result.cloud_mutation,false);
  assert.equal(result.grant_readback_only,true); assert.equal(result.rollout_authorized,false);
});

test('diagnostic rejects retries, alternate context, parent/message, PR and main before authentication',()=>{
  for(const patch of [{GITHUB_RUN_ATTEMPT:'2'},{PREVIEW_EVENT_ACTION:'reopened'},{PREVIEW_PR_NUMBER:'1'},{GITHUB_REF:'refs/heads/main'}])
    assert.throws(()=>verifyDiagnosticSource({...env,...patch},()=>assert.fail('read')));
  for(const altered of [{...commit,parents:[{sha:head}]},{...commit,message:'other'},{...commit,parents:[]}])
    assert.throws(()=>verifyDiagnosticSource(env,runner([altered])));
  assert.throws(()=>verifyDiagnosticSource(env,runner([commit,{...pr,state:'closed'}])));
  assert.throws(()=>verifyDiagnosticSource(env,runner([commit,pr,{commit:{sha:head}}])));
});

test('diagnostic workflow has only read intent and exact gate before OIDC',()=>{
  const workflow=readFileSync('.github/workflows/preview-deployment.yml','utf8');
  const start=workflow.indexOf('  inspect-build-source:');
  const end=workflow.indexOf('\n  quality-gates:',start);
  assert.ok(start>0&&end>start);
  const s=workflow.slice(start,end);
  const current=s.indexOf('run: node scripts/deployment/verify-preview-source.mjs');
  const focused=s.indexOf('run: node --test tests/preview-v2-build-source.test.mjs');
  const exact=s.indexOf('run: node scripts/deployment/verify-preview-build-source-diagnostic.mjs');
  const auth=s.indexOf('uses: google-github-actions/auth@v3');
  const read=s.indexOf('run: python3 scripts/inspect-preview-v2-build-source.py --inspect-actions');
  assert.ok(current>0&&current<focused&&focused<exact&&exact<auth&&auth<read);
  assert.doesNotMatch(s,/\bgcloud\s+(?:builds submit|run deploy|run jobs deploy|projects add-iam-policy-binding|storage buckets add-iam-policy-binding|services enable)\b/);
  assert.match(s,/GITHUB_RUN_ATTEMPT/);
});
