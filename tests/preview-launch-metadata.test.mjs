import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPreviewLaunchMetadata, REQUIRED_SECRETS } from '../scripts/deployment/read-preview-launch-metadata.mjs';
import { PREVIEW_V2_VARIABLES as vars } from '../scripts/deployment/verify-preview-v2-configuration.mjs';
const project = vars.PREVIEW_GOOGLE_CLOUD_PROJECT;
const env = { DEPLOYMENT_ENVIRONMENT: 'preview', GOOGLE_CLOUD_PROJECT: project, PREVIEW_GOOGLE_CLOUD_PROJECT: project,
  GOOGLE_CLOUD_REGION: 'europe-west1', ARTIFACT_REPOSITORY: vars.PREVIEW_ARTIFACT_REPOSITORY,
  RUNTIME_SERVICE_ACCOUNT: vars.PREVIEW_V2_RUNTIME_SERVICE_ACCOUNT, CLOUD_SQL_INSTANCE_CONNECTION_NAME: vars.PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME,
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_FIREBASE_PROJECT_ID: 'khedma-dl', PREVIEW_SCHEMA_POOL_SERIALIZED: 'true',
  GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'PR Preview', GITHUB_REPOSITORY: 'khedma-sy/khedmah-digital-v1', PREVIEW_SCHEMA_IDENTIFIER: 'pr-274-'+'a'.repeat(40) };
function fixture(change = x => x) {
  const calls = [];
  const run = (tool,args,opts) => {
    calls.push(args);
    assert.equal(tool,'gcloud'); assert.ok(args.includes('--project='+project));
    assert.ok(opts.timeout <= 120000); assert.equal(opts.env.CLOUDSDK_CORE_LOG_HTTP,'false');
    assert.doesNotMatch(args.join(' '), /versions access|set-iam|add-iam|builds submit|jobs (execute|deploy|delete)|services (update|delete)|--impersonate/);
    let data;
    if (args[0] === 'projects') data = { projectId:project, projectNumber:'1044962071847', lifecycleState:'ACTIVE' };
    else if (args[0] === 'secrets') data = {name:'projects/1044962071847/secrets/'+args.find(x=>x.startsWith('--secret=')).slice(9)+'/versions/1',state:'ENABLED'};
    else if (args.slice(0,3).join(' ') === 'run services list' || args.slice(0,3).join(' ') === 'run jobs list') data = [];
    else assert.fail('Unexpected command '+args.join(' '));
    return JSON.stringify(change(data,args));
  };
  return {run,calls};
}
test('launch metadata reads the completed version baseline and all nine pool slots with no payloads or writes',()=>{
  const f=fixture(); const report=readPreviewLaunchMetadata(env,f.run);
  assert.equal(f.calls.length,34); assert.equal(report.schema_slots.length,9);
  assert.equal(report.required_secrets.length,12);
  assert.ok(report.required_secrets.some(item=>item.secret==='OPERATIONS_PRODUCT_ROLE_BINDINGS')); assert.equal(report.completed_secret_metadata_matches,true);
  assert.equal(report.service_count,0); assert.equal(report.job_inventory.job_count,0);
  for(const key of ['cloud_mutation','secret_payload_access','database_access','runtime_access_verified','deployment_readiness_verified']) assert.equal(report[key],false);
  assert.equal(report.deployment_held,true);
  for(const secret of REQUIRED_SECRETS) assert.equal(f.calls.filter(a=>a.includes('--secret='+secret)).length,2);
});
test('every target and workflow mismatch stops before a cloud read',()=>{
  for(const key of Object.keys(env)) assert.throws(()=>readPreviewLaunchMetadata({...env,[key]:'foreign'},()=>assert.fail(key)));
});
test('secret denial or changed/disabled latest remains unconfirmed without printing raw output or adopting it',()=>{
  for(const change of ['deny','changed','disabled']) {
    const f=fixture((d,a)=>{
      if(a[0]==='secrets' && a[3]==='latest') {
        if(change==='deny') throw Object.assign(new Error('DO_NOT_PRINT'),{stderr:'PERMISSION_DENIED DO_NOT_PRINT'});
        if(change==='changed') d.name=d.name.replace('/versions/1','/versions/2');
        if(change==='disabled') d.state='DISABLED';
      } return d;
    });
    const report=readPreviewLaunchMetadata(env,f.run);
    assert.equal(report.completed_secret_metadata_matches,false); assert.doesNotMatch(JSON.stringify(report),/DO_NOT_PRINT/);
  }
});
test('malformed, foreign, duplicate and truncated metadata is rejected before any release',()=>{
  const cases=[
    (d,a)=>a[0]==='projects'?{...d,projectNumber:'7'}:d,
    (d,a)=>a[0]==='secrets'?{...d,name:d.name.replace('1044962071847','123')}:d,
    (d,a)=>a[0]==='secrets'?{...d,state:'UNKNOWN'}:d,
    (d,a)=>a[1]==='services'?{}:d,
    (d,a)=>a[1]==='services'?Array(101).fill({}):d,
    (d,a)=>a[1]==='services'?[{metadata:{name:'a',namespace:'123'}}]:d,
    (d,a)=>a[1]==='services'?Array(2).fill({metadata:{name:'a',namespace:'1044962071847',labels:{'cloud.googleapis.com/location':'europe-west1'}}}):d,
  ];
  for(const change of cases) assert.throws(()=>readPreviewLaunchMetadata(env,fixture(change).run));
});
test('workflow requires the first-rollout gate before builds/jobs/deployment',()=>{
  const s=readFileSync(new URL('../.github/workflows/preview-deployment.yml',import.meta.url),'utf8');
  const step=s.split('      - name: Read Preview mail metadata; hold completed rollout\n')[1].split('      - name: Verify Preview inventory')[0];
  assert.match(step,/if ! node scripts\/deployment\/verify-preview-first-rollout\.mjs --inventory; then/);
  assert.match(step,/PREVIEW_SCHEMA_IDENTIFIER: pr-\$\{\{ github.event.pull_request.number \}\}-\$\{\{ github.sha \}\}/);
  assert.ok(step.indexOf('verify-preview-first-rollout.mjs')<step.indexOf('exit 1'));
  assert.doesNotMatch(step,/ROLLOUT_APPROVED|builds submit|jobs execute|deploy-cloud-run-environment/);
});
