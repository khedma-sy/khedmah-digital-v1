import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyFirstRolloutSource, requireEmptyFirstRolloutInventory, REVIEWED_PARENT, REVIEWED_MAIN, RELEASE_MESSAGE } from '../scripts/deployment/verify-preview-first-rollout.mjs';
const repo='khedma-sy/khedmah-digital-v1',head='a'.repeat(40);
const env={GITHUB_REPOSITORY:repo,GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/274/merge',PREVIEW_EVENT_ACTION:'synchronize',GITHUB_RUN_ATTEMPT:'1',PREVIEW_PR_NUMBER:'274',PREVIEW_HEAD_SHA:head};
const commit={sha:head,parents:[{sha:REVIEWED_PARENT}],message:RELEASE_MESSAGE};
const pr={number:274,state:'open',merged:false,head:{sha:head,repo:{full_name:repo}},base:{ref:'main',repo:{full_name:repo}}};
const main={commit:{sha:REVIEWED_MAIN}};
const runner=(responses,calls=[])=> (tool,args,options)=>{calls.push(args);assert.equal(tool,'gh');assert.equal(args[0],'api');assert.ok(!args.includes('--method'));assert.equal(options.timeout,30000);return JSON.stringify(responses.shift());};
test('first rollout accepts only the reviewed direct successor, current open same-repository PR and unchanged main',()=>{
 const calls=[];const result=verifyFirstRolloutSource(env,runner([commit,pr,main],calls));assert.equal(calls.length,3);assert.equal(result.release_head,head);assert.equal(result.cloud_mutation,false);
});
test('reruns, reopen, wrong PR/fork/ref/event and malformed heads stop before all external reads',()=>{
 for(const key of Object.keys(env)) assert.throws(()=>verifyFirstRolloutSource({...env,[key]:'other'},()=>assert.fail('read')));
 for(const attempt of ['0','2','',undefined]) assert.throws(()=>verifyFirstRolloutSource({...env,GITHUB_RUN_ATTEMPT:attempt},()=>assert.fail('read')));
});
test('later documentation commits, alternate parents and stale/replaced PR/main are held',()=>{
 for(const altered of [{...commit,parents:[{sha:head}]},{...commit,parents:[]},{...commit,parents:[{sha:REVIEWED_PARENT},{sha:head}]},{...commit,message:'docs: update [skip ci]'},{...commit,sha:'b'.repeat(40)}]) assert.throws(()=>verifyFirstRolloutSource(env,runner([altered])));
 for(const altered of [{...pr,state:'closed'},{...pr,merged:true},{...pr,head:{...pr.head,sha:'b'.repeat(40)}},{...pr,base:{...pr.base,ref:'other'}},{...pr,head:{...pr.head,repo:{full_name:'foreign/repo'}}}]) assert.throws(()=>verifyFirstRolloutSource(env,runner([commit,altered])));
 assert.throws(()=>verifyFirstRolloutSource(env,runner([commit,pr,{commit:{sha:'b'.repeat(40)}}])));
});
test('unavailable or malformed GitHub responses are held without exposing provider output or retrying',()=>{
 let calls=0;assert.throws(()=>verifyFirstRolloutSource(env,()=>{calls++;throw new Error('TOKEN_DO_NOT_PRINT');}),/^Error: PREVIEW_FIRST_ROLLOUT_SOURCE_READ_HELD$/);assert.equal(calls,1);
 assert.throws(()=>verifyFirstRolloutSource(env,()=>'{bad'),/^Error: PREVIEW_FIRST_ROLLOUT_SOURCE_READ_HELD$/);
});
const inventory={project:'khedmah-preview-v2-20261012',project_number:'1044962071847',service_count:0,service_names:[],job_inventory:{job_count:0,oldest_jobs:[]},completed_secret_metadata_matches:true,required_secrets:Array.from({length:11},()=>({staged_version_1_enabled_and_latest:true})),schema_slots:Array.from({length:9},()=>({before_deploy_check_passed:true})),cloud_mutation:false,secret_payload_access:false,database_access:false};
test('first rollout refuses any existing service/job or unconfirmed version/pool state; no adoption or replay',()=>{
 requireEmptyFirstRolloutInventory(inventory);
 for(const key of Object.keys(inventory))assert.throws(()=>requireEmptyFirstRolloutInventory({...inventory,[key]:undefined}));
 for(const patch of [{service_count:1},{job_inventory:{job_count:1,oldest_jobs:[]}},{required_secrets:[...inventory.required_secrets.slice(1),{staged_version_1_enabled_and_latest:false}]},{schema_slots:inventory.schema_slots.slice(1)}])assert.throws(()=>requireEmptyFirstRolloutInventory({...inventory,...patch}));
});
test('workflow source decision precedes OIDC; fresh empty inventory precedes pool checks and all cloud mutations',()=>{
 const s=readFileSync('.github/workflows/preview-deployment.yml','utf8');
 const gate=s.indexOf('run: node scripts/deployment/verify-preview-first-rollout.mjs --source');
 const auth=s.indexOf('uses: google-github-actions/auth@v3');
 const inventory=s.indexOf('node scripts/deployment/verify-preview-first-rollout.mjs --inventory');
 assert.ok(gate>0&&gate<auth&&auth<inventory&&inventory<s.indexOf('PREVIEW_SCHEMA_POOL_ROLLOUT_APPROVED'));
 assert.ok(s.indexOf('PREVIEW_SCHEMA_POOL_ROLLOUT_APPROVED')<s.indexOf('run: scripts/deployment/deploy-cloud-run-environment.sh'));
 assert.match(s,/PREVIEW_EVENT_ACTION: \$\{\{ github.event.action \}\}/);
});
