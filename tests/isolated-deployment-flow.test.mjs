import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
const script='scripts/deployment/deploy-cloud-run-environment.sh';
function fixture(environment,overrides={}) {
  const dir=mkdtempSync(join(tmpdir(),'khedmah-deploy-'));const bin=join(dir,'bin');mkdirSync(bin);const log=join(dir,'calls.jsonl');
  const record=`const fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify({tool:require('node:path').basename(process.argv[1]),args:a})+'\\n');`;
  writeFileSync(join(bin,'gcloud'),'#!/usr/bin/env node\n'+record+`if(a[0]==='run'&&a[1]==='services'&&a[2]==='describe'){const type=a[3].includes('backend')?'backend':'frontend';console.log('https://'+type+'-'+process.env.FIXTURE_ENV+'.example.run.app');}`,{mode:0o755});
  writeFileSync(join(bin,'curl'),'#!/usr/bin/env node\n'+record+`if(a.includes('--dump-header')){const i=a.indexOf('--header'),origin=a[i+1].slice('Origin: '.length);const value=process.env.FIXTURE_BAD_CORS==='1'?'*':origin;fs.writeFileSync(a[a.indexOf('--dump-header')+1],'HTTP/2 204 No Content\\r\\nAccess-Control-Allow-Origin: '+value+'\\r\\nAccess-Control-Allow-Credentials: true\\r\\n\\r\\n');}`,{mode:0o755});
  const env={...process.env,PATH:bin+':'+process.env.PATH,FIXTURE_LOG:log,FIXTURE_ENV:environment,GOOGLE_CLOUD_PROJECT:`${environment}-fixture`,PRODUCTION_GOOGLE_CLOUD_PROJECT:'production-fixture',GOOGLE_CLOUD_REGION:'me-central1',ARTIFACT_REPOSITORY:`${environment}-images`,RUNTIME_SERVICE_ACCOUNT:'fixture-deployer',CLOUD_SQL_INSTANCE_CONNECTION_NAME:`${environment}-fixture:me-central1:isolated-db`,GCS_MEDIA_BUCKET:`${environment}-fixture-media`,EMAIL_FROM:'noreply@staging.example',...overrides};
  return{run(){return execFileSync('bash',[script,environment,environment==='preview'?'pr-166-abcdef123':'abcdef123'],{env,encoding:'utf8',stdio:'pipe'});},calls(){try{return readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);}catch{return[];}},close(){rmSync(dir,{recursive:true,force:true});}};
}
for(const environment of ['preview','staging'])test(`${environment}: deploys isolated backend first, builds its matching frontend and verifies credentialed CORS`,()=>{
  const f=fixture(environment);try{assert.match(f.run(),/deployment healthy/);const calls=f.calls();const builds=calls.filter(c=>c.tool==='gcloud'&&c.args[0]==='builds');assert.equal(builds.length,2);assert.ok(builds[0].args.includes(`cloudbuild.${environment}-backend.yaml`));assert.ok(builds[1].args.some(a=>a.includes(`_NEXT_PUBLIC_API_URL=https://backend-${environment}.example.run.app`)));
    const deploys=calls.filter(c=>c.tool==='gcloud'&&c.args[1]==='deploy');assert.equal(deploys.length,2);const backend=deploys.find(c=>c.args[2].includes('backend'));assert.ok(backend.args.includes(`${environment}-fixture:me-central1:isolated-db`));
    const secretArg=backend.args.find(a=>a.startsWith('--set-secrets='));assert.ok(secretArg?.includes('DATABASE_URL=DATABASE_URL:latest'));if(environment==='staging'){for(const binding of ['OPERATIONS_PRODUCT_ROLE_BINDINGS=OPERATIONS_PRODUCT_ROLE_BINDINGS:latest','RESEND_API_KEY=RESEND_API_KEY:latest','FIREBASE_API_KEY=FIREBASE_API_KEY:latest'])assert.ok(secretArg.includes(binding));const envArg=backend.args.find(a=>a.startsWith('--set-env-vars='));assert.ok(envArg?.includes('GCS_MEDIA_BUCKET=staging-fixture-media'));assert.ok(envArg?.includes('EMAIL_FROM=noreply@staging.example'));}else assert.equal(secretArg,'--set-secrets=DATABASE_URL=DATABASE_URL:latest');
    const origin=calls.find(c=>c.tool==='gcloud'&&c.args[1]==='services'&&c.args[2]==='update');assert.ok(origin.args.includes(`--update-env-vars=CORS_ORIGIN=https://frontend-${environment}.example.run.app,NEXT_PUBLIC_SITE_URL=https://frontend-${environment}.example.run.app`));assert.ok(calls.indexOf(origin)>calls.indexOf(deploys[1]));
    const preflight=calls.find(c=>c.tool==='curl'&&c.args.includes('OPTIONS'));assert.ok(preflight.args.includes(`Origin: https://frontend-${environment}.example.run.app`));
  }finally{f.close();}
});
for(const environment of ['preview','staging'])test(`${environment}: refuses missing, cross-project or production database configuration before cloud calls`,()=>{
  for(const overrides of [{CLOUD_SQL_INSTANCE_CONNECTION_NAME:''},{CLOUD_SQL_INSTANCE_CONNECTION_NAME:'other-project:me-central1:database'},{GOOGLE_CLOUD_PROJECT:'production-fixture'}]){const f=fixture(environment,overrides);try{assert.throws(()=>f.run());assert.equal(f.calls().length,0);}finally{f.close();}}
});
test('staging refuses ephemeral media or email configuration before cloud calls',()=>{
  for(const overrides of [{GCS_MEDIA_BUCKET:''},{EMAIL_FROM:''}]){const f=fixture('staging',overrides);try{assert.throws(()=>f.run());assert.equal(f.calls().length,0);}finally{f.close();}}
});
test('incorrect deployed CORS never reports a healthy deployment',()=>{
  const f=fixture('preview',{FIXTURE_BAD_CORS:'1'});try{assert.throws(()=>f.run(),e=>e.status!==0&&e.stderr.toString().includes('exact credentialed origin'));}finally{f.close();}
});
test('CORS verifier requires headers on the successful final response, not an earlier retry',()=>{
  const dir=mkdtempSync(join(tmpdir(),'khedmah-preflight-'));const path=join(dir,'headers');const origin='https://frontend.example.test';const valid=`HTTP/2 204 No Content\r\nAccess-Control-Allow-Origin: ${origin}\r\nAccess-Control-Allow-Credentials: true\r\n\r\n`;
  try{for(const response of [valid+'HTTP/2 204 No Content\r\n\r\n',valid+'HTTP/2 503 Unavailable\r\n\r\n',valid.replace('true','false'),valid.replace('Access-Control-Allow-Origin:',`Access-Control-Allow-Origin: ${origin}\r\nAccess-Control-Allow-Origin:`)]){writeFileSync(path,response);assert.throws(()=>execFileSync(process.execPath,['scripts/deployment/verify-cors-preflight.mjs',path,origin],{stdio:'pipe'}));}writeFileSync(path,valid);assert.match(execFileSync(process.execPath,['scripts/deployment/verify-cors-preflight.mjs',path,origin],{encoding:'utf8'}),/origin verified/);}finally{rmSync(dir,{recursive:true,force:true});}
});
