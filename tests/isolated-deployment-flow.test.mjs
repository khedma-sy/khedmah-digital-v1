import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {STAGES} from '../scripts/deployment/preview-schema-job-pool.mjs';
import test from 'node:test';
const script='scripts/deployment/deploy-cloud-run-environment.sh';
const previewProject='khedmah-preview-v2-20261012';
const previewAccount=role=>`khedmah-pv2-${role}@${previewProject}.iam.gserviceaccount.com`;
const argument=(call,flag)=>{const i=call.args.indexOf(flag);return i>=0?call.args[i+1]:call.args.find(x=>x.startsWith(flag+'='))?.slice(flag.length+1);};
function fixture(environment,overrides={}) {
  const dir=mkdtempSync(join(tmpdir(),'khedmah-deploy-'));
  const bin=join(dir,'bin');mkdirSync(bin);const log=join(dir,'calls.jsonl');
  const project=environment==='preview'?previewProject:'staging-fixture';
  const region=environment==='preview'?'europe-west1':'me-central1';
  const state=join(dir,'jobs.json');writeFileSync(state,'{}');
  const record=String.raw`const fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify({tool:require('node:path').basename(process.argv[1]),args:a})+'\n');`;
  const shebang='#!'+process.execPath+'\n';
  // Run the real pinned pool policy; only cloud commands are replaced by fixtures.
  const poolUrl=pathToFileURL(resolve('scripts/deployment/preview-schema-job-pool.mjs')).href;
  writeFileSync(join(bin,'node'),shebang+`
const args=process.argv.slice(2);
if(args[0]==='scripts/deployment/preview-schema-job-pool.mjs') {
  import(${JSON.stringify(poolUrl)}).then(({schemaPoolCommand})=>{
    require('node:fs').appendFileSync(process.env.FIXTURE_LOG,JSON.stringify({tool:'schema-pool',args:args.slice(1)})+'\\n');
    const output=schemaPoolCommand(args.slice(1),process.env);
    if(output!==undefined)console.log(output);
  }).catch(error=>{console.error('STOP: '+error.message);process.exitCode=1;});
} else {
  const result=require('node:child_process').spawnSync(${JSON.stringify(process.execPath)},args,{stdio:'inherit'});
  process.exitCode=result.status??1;
}`,{mode:0o755});
  writeFileSync(join(bin,'gcloud'),shebang+record+`
const value=flag=>{const i=a.indexOf(flag);return i>=0?a[i+1]:a.find(x=>x.startsWith(flag+'='))?.slice(flag.length+1);};
if(a[0]==='builds'&&value('--config')===process.env.FIXTURE_FAIL_BUILD_CONFIG)process.exit(31);
if(a[0]==='secrets'&&process.env.FIXTURE_PREVIEW_MAIL==='1')console.log('1');
if(a[0]==='run'&&a[1]==='services'&&a[2]==='describe'){
  const type=a[3].includes('backend')?'backend':'frontend';
  console.log('https://'+type+'-'+process.env.FIXTURE_ENV+'.example.run.app');
}
if(a[0]==='run'&&a[1]==='jobs'){
  const jobs=JSON.parse(fs.readFileSync(process.env.FIXTURE_JOBS,'utf8'));
  const name=a[3];
  if(a[2]==='list')console.log(JSON.stringify(Object.keys(jobs).map(name=>({metadata:{name}}))));
  else if(a[2]==='describe'){
    const projected=structuredClone(jobs[name].job);
    if(!(value('--format')??'').includes('spec.template.spec.template.spec.containers[].env'))delete projected.spec.template.spec.template.spec.containers[0].env;
    console.log(JSON.stringify(projected));
  }
  else if(a[2]==='executions'&&a[3]==='list')console.log(JSON.stringify(jobs[value('--job')].executions));
  else if(a[2]==='deploy'){
    // jobs deploy accepts --labels; --update-labels belongs to jobs update.
    if(a.some(x=>x==='--update-labels'||x.startsWith('--update-labels=')))throw Error('jobs deploy: unsupported --update-labels');
    const generation=(jobs[name]?.job.metadata.generation??0)+1;
    const labels={'cloud.googleapis.com/location':value('--region'),...Object.fromEntries((value('--labels')??'').split(',').filter(Boolean).map(x=>x.split('=')))};
    jobs[name]={executions:jobs[name]?.executions??[],job:{
      metadata:{name,namespace:'1044962071847',uid:'a'.repeat(32),generation,labels},
      spec:{template:{metadata:{annotations:{'run.googleapis.com/cloudsql-instances':value('--set-cloudsql-instances')}},
        spec:{template:{spec:{serviceAccountName:value('--service-account'),containers:[{image:value('--image'),
          env:(value('--set-secrets')??'').split(',').filter(Boolean).map(binding=>{
            const [name,reference]=binding.split('=');const [secret,key]=reference.split(':');
            return {name,valueFrom:{secretKeyRef:{name:secret,key}}};
          })}]}}}}},
      status:{...(jobs[name]?.job.status??{executionCount:0}),observedGeneration:generation,conditions:[{type:'Ready',status:'True'}]}
    }};
  } else if(a[2]==='execute'){
    const entry=jobs[name];const sequence=++entry.job.status.executionCount;
    const execution=name+'-run'+sequence;
    const running=process.env.FIXTURE_RUNNING_STAGE&&name.endsWith(process.env.FIXTURE_RUNNING_STAGE);
    entry.executions.push({metadata:{name:execution,namespace:'1044962071847',creationTimestamp:'2026-10-11T10:00:00Z',labels:{'run.googleapis.com/job':name}},
      status:running?{runningCount:1,conditions:[{type:'Completed',status:'Unknown'}]}:
        {runningCount:0,completionTime:'2026-10-11T10:01:00Z',conditions:[{type:'Completed',status:'True'}]}});
    entry.job.status.latestCreatedExecution={name:execution};
  } else throw Error('Unexpected fixture Job operation');
  fs.writeFileSync(process.env.FIXTURE_JOBS,JSON.stringify(jobs));
}`,{mode:0o755});
  writeFileSync(join(bin,'curl'),shebang+record+`if(a.includes('--dump-header')){const i=a.indexOf('--header'),origin=a[i+1].slice('Origin: '.length);const value=process.env.FIXTURE_BAD_CORS==='1'?'*':origin;fs.writeFileSync(a[a.indexOf('--dump-header')+1],'HTTP/2 204 No Content\\r\\nAccess-Control-Allow-Origin: '+value+'\\r\\nAccess-Control-Allow-Credentials: true\\r\\n\\r\\n');}`,{mode:0o755});
  const env={...process.env,PATH:bin+':'+process.env.PATH,FIXTURE_LOG:log,FIXTURE_JOBS:state,FIXTURE_ENV:environment,
    GOOGLE_CLOUD_PROJECT:project,PRODUCTION_GOOGLE_CLOUD_PROJECT:'khedma-dl',PRODUCTION_FIREBASE_PROJECT_ID:'khedma-dl',
    GOOGLE_CLOUD_REGION:region,ARTIFACT_REPOSITORY:environment==='preview'?'khedmah-preview':`${environment}-images`,
    RUNTIME_SERVICE_ACCOUNT:environment==='preview'?previewAccount('runtime'):`runtime@${project}.iam.gserviceaccount.com`,
    CLOUD_SQL_INSTANCE_CONNECTION_NAME:`${project}:${region}:${environment==='preview'?'khedmah-preview-v2-db':'isolated-db'}`,
    GCS_MEDIA_BUCKET:`${environment}-fixture-media`,EMAIL_FROM:'noreply@staging.example',
    PREVIEW_SCHEMA_POOL_SERIALIZED:'true',GITHUB_ACTIONS:'true',GITHUB_WORKFLOW:'PR Preview',GITHUB_REPOSITORY:'khedma-sy/khedmah-digital-v1',...overrides};
  return{
    run(identifier=environment==='preview'?'pr-166-abcdef123':'abcdef123',extraEnv={}){
      return execFileSync('bash',[script,environment,identifier],{env:{...env,...extraEnv},encoding:'utf8',stdio:'pipe'});
    },
    calls(){try{return readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);}catch{return[];}},
    jobs(){return JSON.parse(readFileSync(state,'utf8'));},
    close(){rmSync(dir,{recursive:true,force:true});}
  };
}
for(const environment of ['preview','staging'])test(`${environment}: deploys isolated backend first, builds its matching frontend and verifies credentialed CORS`,()=>{
  const f=fixture(environment);try{assert.match(f.run(),/deployment healthy/);const calls=f.calls();const builds=calls.filter(c=>c.tool==='gcloud'&&c.args[0]==='builds');assert.equal(builds.length,11);assert.ok(builds[0].args.includes('cloudbuild.foundation-nonproduction.yaml'));assert.ok(builds[1].args.includes('cloudbuild.product-store-migration.yaml'));assert.ok(builds[2].args.includes('cloudbuild.classifieds-migration.yaml'));assert.ok(builds[3].args.includes('cloudbuild.fulfillment-migration.yaml'));assert.ok(builds[4].args.includes('cloudbuild.taxi-pricing-migration.yaml'));assert.ok(builds[5].args.includes('cloudbuild.billing-migration.yaml'));assert.ok(builds[6].args.includes('cloudbuild.taxi-operational-migration.yaml'));assert.ok(builds[7].args.includes('cloudbuild.taxi-operational-profile-gate-migration.yaml'));assert.ok(builds[8].args.includes('cloudbuild.food-promotions-migration.yaml'));assert.ok(builds[9].args.includes(`cloudbuild.${environment}-backend.yaml`));assert.ok(builds[10].args.some(a=>a.includes(`_NEXT_PUBLIC_API_URL=https://backend-${environment}.example.run.app`)));
    const deploys=calls.filter(c=>c.tool==='gcloud'&&c.args[1]==='deploy');assert.equal(deploys.length,2);const backend=deploys.find(c=>c.args[2].includes('backend'));assert.ok(backend.args.includes(environment==='preview'?`${previewProject}:europe-west1:khedmah-preview-v2-db`:'staging-fixture:me-central1:isolated-db'));
    const runtimeEnv=backend.args.find(a=>a.startsWith('--set-env-vars='));assert.ok(runtimeEnv?.includes('TAXI_ACCESS_ENABLED=true'));assert.ok(runtimeEnv?.includes('TAXI_TRIPS_ENABLED=false'));
    const secretArg=backend.args.find(a=>a.startsWith('--set-secrets='));if(environment==='staging'){assert.ok(secretArg?.includes('DATABASE_URL=DATABASE_URL:latest'));for(const binding of ['OPERATIONS_PRODUCT_ROLE_BINDINGS=OPERATIONS_PRODUCT_ROLE_BINDINGS:latest','RESEND_API_KEY=RESEND_API_KEY:latest','FIREBASE_API_KEY=FIREBASE_API_KEY:latest'])assert.ok(secretArg.includes(binding));assert.ok(runtimeEnv?.includes('GCS_MEDIA_BUCKET=staging-fixture-media'));assert.ok(runtimeEnv?.includes('EMAIL_FROM=noreply@staging.example'));}else assert.equal(secretArg,'--set-secrets=DATABASE_URL=DATABASE_URL:1');
    const frontend=deploys.find(c=>c.args[2].includes('frontend'));
    if(environment==='preview'){
      for(const build of builds){
        assert.equal(argument(build,'--service-account'),`projects/${previewProject}/serviceAccounts/${previewAccount('build')}`);
        assert.equal(argument(build,'--gcs-source-staging-dir'),`gs://${previewProject}-cloudbuild-source/source`);
      }
      assert.equal(argument(backend,'--service-account'),previewAccount('runtime'));
      assert.ok(backend.args.includes('--set-cloudsql-instances'));assert.ok(!backend.args.includes('--add-cloudsql-instances'));
      assert.equal(argument(frontend,'--service-account'),previewAccount('frontend'));
      assert.ok(frontend.args.includes('--clear-secrets'));assert.ok(frontend.args.includes('--clear-cloudsql-instances'));
      assert.equal(argument(frontend,'--set-secrets'),undefined);
      for(const job of Object.values(f.jobs())){
        const spec=job.job.spec.template.spec.template.spec;
        assert.equal(spec.serviceAccountName,previewAccount('migrator'));
        assert.deepEqual(spec.containers[0].env,[{name:'DATABASE_URL',valueFrom:{secretKeyRef:{name:'DATABASE_MIGRATION_URL',key:'1'}}}]);
      }
    }else{
      assert.equal(argument(frontend,'--service-account'),'runtime@staging-fixture.iam.gserviceaccount.com');
      assert.ok(backend.args.includes('--add-cloudsql-instances'));
      assert.ok(!frontend.args.includes('--clear-secrets'));assert.ok(!frontend.args.includes('--clear-cloudsql-instances'));
      for(const build of builds)assert.equal(argument(build,'--service-account'),undefined);
      for(const build of builds.slice(-2))assert.equal(argument(build,'--gcs-source-staging-dir'),'gs://staging-fixture-cloudbuild-source/source');
    }
    const origin=calls.find(c=>c.tool==='gcloud'&&c.args[1]==='services'&&c.args[2]==='update');assert.ok(origin.args.includes(`--update-env-vars=CORS_ORIGIN=https://frontend-${environment}.example.run.app,NEXT_PUBLIC_SITE_URL=https://frontend-${environment}.example.run.app`));assert.ok(calls.indexOf(origin)>calls.indexOf(deploys[1]));
    const preflight=calls.find(c=>c.tool==='curl'&&c.args.includes('OPTIONS'));assert.ok(preflight.args.includes(`Origin: https://frontend-${environment}.example.run.app`));
  }finally{f.close();}
});
for(const environment of ['preview','staging'])test(`${environment}: refuses missing, cross-project or production database configuration before cloud calls`,()=>{
  for(const overrides of [{CLOUD_SQL_INSTANCE_CONNECTION_NAME:''},{CLOUD_SQL_INSTANCE_CONNECTION_NAME:'other-project:me-central1:database'},{GOOGLE_CLOUD_PROJECT:'khedma-dl'}]){const f=fixture(environment,overrides);try{assert.throws(()=>f.run());assert.equal(f.calls().length,0);}finally{f.close();}}
});
test('staging refuses ephemeral media or email configuration before cloud calls',()=>{
  for(const overrides of [{GCS_MEDIA_BUCKET:''},{EMAIL_FROM:''}]){const f=fixture('staging',overrides);try{assert.throws(()=>f.run());assert.equal(f.calls().length,0);}finally{f.close();}}
});
test('replacement application rejects drifted identities and targets before even mail metadata reads',()=>{
  for(const overrides of [
    {RUNTIME_SERVICE_ACCOUNT:previewAccount('migrator')},
    {ARTIFACT_REPOSITORY:'foreign-images'},
    {GOOGLE_CLOUD_REGION:'us-central1',CLOUD_SQL_INSTANCE_CONNECTION_NAME:`${previewProject}:us-central1:khedmah-preview-v2-db`},
    {CLOUD_SQL_INSTANCE_CONNECTION_NAME:`${previewProject}:europe-west1:other-db`},
    {PRODUCTION_GOOGLE_CLOUD_PROJECT:'unreviewed-production'},
    {GOOGLE_CLOUD_PROJECT:'khedmah-preview-other',CLOUD_SQL_INSTANCE_CONNECTION_NAME:'khedmah-preview-other:europe-west1:db'},
  ]){
    const f=fixture('preview',overrides);
    try{assert.throws(()=>f.run());assert.deepEqual(f.calls(),[]);}finally{f.close();}
  }
  const f=fixture('staging',{GOOGLE_CLOUD_PROJECT:previewProject,GOOGLE_CLOUD_REGION:'europe-west1',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME:`${previewProject}:europe-west1:khedmah-preview-v2-db`,RUNTIME_SERVICE_ACCOUNT:previewAccount('runtime')});
  try{assert.throws(()=>f.run());assert.deepEqual(f.calls(),[]);}finally{f.close();}
});
test('failed application builds cannot publish the dependent service or report health',()=>{
  for(const config of ['cloudbuild.preview-backend.yaml','cloudbuild.preview.yaml']){
    const f=fixture('preview',{FIXTURE_FAIL_BUILD_CONFIG:config});
    try{
      assert.throws(()=>f.run(),error=>error.status===31&&!error.stdout.toString().includes('deployment healthy'));
      const services=f.calls().filter(c=>c.tool==='gcloud'&&c.args[0]==='run'&&c.args[1]==='deploy');
      assert.equal(services.length,config==='cloudbuild.preview-backend.yaml'?0:1);
      assert.ok(services.every(c=>c.args[2].endsWith('-backend')));
      assert.ok(f.calls().every(c=>c.tool!=='gcloud'||c.args.slice(0,3).join(' ')!=='run services update'));
    }finally{f.close();}
  }
});
test('incorrect deployed CORS never reports a healthy deployment',()=>{
  const f=fixture('preview',{FIXTURE_BAD_CORS:'1'});try{assert.throws(()=>f.run(),e=>e.status!==0&&e.stderr.toString().includes('exact credentialed origin'));}finally{f.close();}
});
test('CORS verifier requires headers on the successful final response, not an earlier retry',()=>{
  const dir=mkdtempSync(join(tmpdir(),'khedmah-preflight-'));const path=join(dir,'headers');const origin='https://frontend.example.test';const valid=`HTTP/2 204 No Content\r\nAccess-Control-Allow-Origin: ${origin}\r\nAccess-Control-Allow-Credentials: true\r\n\r\n`;
  try{for(const response of [valid+'HTTP/2 204 No Content\r\n\r\n',valid+'HTTP/2 503 Unavailable\r\n\r\n',valid.replace('true','false'),valid.replace('Access-Control-Allow-Origin:',`Access-Control-Allow-Origin: ${origin}\r\nAccess-Control-Allow-Origin:`)]){writeFileSync(path,response);assert.throws(()=>execFileSync(process.execPath,['scripts/deployment/verify-cors-preflight.mjs',path,origin],{stdio:'pipe'}));}writeFileSync(path,valid);assert.match(execFileSync(process.execPath,['scripts/deployment/verify-cors-preflight.mjs',path,origin],{encoding:'utf8'}),/origin verified/);}finally{rmSync(dir,{recursive:true,force:true});}
});


test('preview binds an existing mail secret without copying values or changing the site origin',()=>{
  const f=fixture('preview',{FIXTURE_PREVIEW_MAIL:'1',EMAIL_FROM:'noreply@mail.khedmah.uk'});
  try {
    assert.match(f.run(),/deployment healthy/);
    const calls=f.calls();
    const backend=calls.find(c=>c.tool==='gcloud'&&c.args[0]==='run'&&c.args[1]==='deploy'&&c.args[2].includes('backend'));
    assert.equal(backend.args.find(a=>a.startsWith('--set-secrets=')),'--set-secrets=DATABASE_URL=DATABASE_URL:1,RESEND_API_KEY=RESEND_API_KEY:latest');
    assert.ok(backend.args.some(a=>a.startsWith('--set-env-vars=')&&a.includes('EMAIL_FROM=noreply@mail.khedmah.uk')));
    assert.ok(calls.some(c=>c.tool==='gcloud'&&c.args[0]==='secrets'&&c.args.includes(previewProject)));
    assert.ok(calls.every(c=>!c.args.includes('khedma-dl')&&!c.args.includes('access')));
    assert.ok(calls.some(c=>c.args.includes('--update-env-vars=CORS_ORIGIN=https://frontend-preview.example.run.app,NEXT_PUBLIC_SITE_URL=https://frontend-preview.example.run.app')));
  } finally { f.close(); }
});


test('successive Preview PRs reuse the same nine guarded schema Jobs',()=>{
  const f=fixture('preview');
  try {
    f.run();f.run('pr-167-defabc456');
    const calls=f.calls();const names=Object.keys(STAGES).map(stage=>'khedmah-preview-schema-'+stage);
    assert.deepEqual(Object.keys(f.jobs()).sort(),names.sort());
    const deploys=calls.filter(c=>c.tool==='gcloud'&&c.args.slice(0,3).join(' ')==='run jobs deploy');
    assert.equal(deploys.length,18);assert.equal(new Set(deploys.map(c=>c.args[3])).size,9);
    for(const stage of Object.keys(STAGES)){
      const checks=calls.filter(c=>c.tool==='schema-pool'&&c.args[3]===stage);
      assert.deepEqual(checks.map(c=>c.args[0]),['name','before-deploy','before-execute','name','before-deploy','before-execute']);
      const entry=f.jobs()['khedmah-preview-schema-'+stage];
      assert.equal(entry.job.status.executionCount,2);
      assert.match(entry.job.spec.template.spec.template.spec.containers[0].image,/:preview-pr-167-defabc456$/);
    }
    assert.equal(calls.filter(c=>c.tool==='gcloud'&&c.args.slice(0,3).join(' ')==='run jobs describe').length,27);
  } finally {f.close();}
});

test('an execution left running stops the next Preview before Job reuse or service rollout',()=>{
  const f=fixture('preview');
  try {
    f.run('pr-166-abcdef123',{FIXTURE_RUNNING_STAGE:'foundation-001-022'});
    const previous=f.calls().length;
    assert.throws(()=>f.run('pr-167-defabc456'),e=>e.status!==0&&e.stderr.toString().includes('ACTIVE_OR_UNVERIFIED_EXECUTION'));
    const calls=f.calls().slice(previous);
    assert.ok(calls.some(c=>c.tool==='gcloud'&&c.args.slice(0,4).join(' ')==='run jobs executions list'));
    assert.ok(calls.every(c=>c.tool!=='gcloud'||!c.args.some(x=>['deploy','execute','delete','update'].includes(x))));
  } finally {f.close();}
});
