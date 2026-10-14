#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export function assertSourceInventory(names) {
  const files = names.split('\n').map(x => x.replace(/^\.\//,'').trim()).filter(Boolean);
  if (files.some(x => /(^|\/)gha-creds-[^/]*\.json$/.test(x))) throw new Error('BUILD_SOURCE_TRANSIENT_CREDENTIAL_INCLUDED');
  for (const required of ['Dockerfile','package.json','scripts/probe.sql','nested/keep.txt']) {
    if (!files.includes(required)) throw new Error('BUILD_SOURCE_REQUIRED_FIXTURE_FILE_MISSING');
  }
}
export function verifyBuildSourceExclusions() {
  const dir=mkdtempSync(join(tmpdir(),'khedmah-build-source-'));
  const id='khedmah-context-test-'+randomBytes(8).toString('hex');
  let container=false,image=false;
  const run=(cmd,args,options={})=>execFileSync(cmd,args,{cwd:dir,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe'],...options});
  try {
    for(const name of ['.gitignore','.gcloudignore','.dockerignore']) writeFileSync(join(dir,name),readFileSync(name));
    mkdirSync(join(dir,'scripts'));mkdirSync(join(dir,'nested'));
    for(const name of ['gha-creds-inert-fixture.json','nested/gha-creds-inert-fixture.json']) writeFileSync(join(dir,name),'INERT_TEST_DATA_NOT_A_CREDENTIAL\n');
    writeFileSync(join(dir,'package.json'),'{}\n');writeFileSync(join(dir,'scripts/probe.sql'),'SELECT 1;\n');writeFileSync(join(dir,'nested/keep.txt'),'retained\n');
    writeFileSync(join(dir,'Dockerfile'),'FROM scratch\nCOPY . /fixture/\n');
    run('git',['init','--quiet']);
    const excluded=run('git',['check-ignore','--no-index','gha-creds-inert-fixture.json','nested/gha-creds-inert-fixture.json']);
    if(excluded.trim().split('\n').length!==2)throw new Error('BUILD_SOURCE_GIT_EXCLUSION_FAILED');
    const upload=run('gcloud',['meta','list-files-for-upload','--verbosity=error'],{env:{...process.env,CLOUDSDK_GCLOUDIGNORE_ENABLED:'true',CLOUDSDK_CORE_LOG_HTTP:'false',CLOUDSDK_CORE_DISABLE_FILE_LOGGING:'true',CLOUDSDK_CORE_DISABLE_PROMPTS:'true'}});
    assertSourceInventory(upload);
    run('docker',['build','--network=none','--quiet','--tag',id,'.']);image=true;
    run('docker',['create','--name',id,id,'/unused']);container=true;
    const archive=run('docker',['export',id],{encoding:null});
    const files=run('tar',['-tf','-'],{input:archive}).split('\n').filter(x=>x.startsWith('fixture/')).map(x=>x.slice(8)).join('\n');
    assertSourceInventory(files);
    console.log('BUILD_SOURCE_GIT_GCLOUD_DOCKER_EXCLUSIONS_VERIFIED');
  } finally {
    if(container)run('docker',['rm','--force',id]);
    if(image)run('docker',['image','rm','--force',id]);
    rmSync(dir,{recursive:true,force:true});
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.length!==2)throw new Error('BUILD_SOURCE_ARGUMENTS_REJECTED');verifyBuildSourceExclusions();}
 catch(error){console.error(/^BUILD_SOURCE_[A-Z_]+$/.test(error?.message??'')?error.message:'BUILD_SOURCE_EXCLUSIONS_UNCONFIRMED');process.exitCode=1;}
}
