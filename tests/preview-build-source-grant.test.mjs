import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('Preview build-source metadata grant helper and bootstrap contract pass',()=>{
  const result=spawnSync('python3',['-m','unittest',
    'tests.test_preview_v2_build_source_grant','tests.test_preview_v2_bootstrap'],{
    cwd:process.cwd(),encoding:'utf8',timeout:120000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}
  });
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
});

test('grant is exact-bucket IAM only and never deploys or touches Production',()=>{
  const source=readFileSync('scripts/grant-preview-v2-build-source-metadata.py','utf8');
  assert.match(source,/PROJECT = 'khedmah-preview-v2-20261012'/);
  assert.match(source,/BUCKET = PROJECT \+ '-cloudbuild-source'/);
  assert.match(source,/roles\/storage\.bucketViewer/);
  assert.match(source,/storage\.buckets\.get/);
  assert.doesNotMatch(source,/khedma-dl|roles\/storage\.admin|projects.*set-iam-policy|builds.*submit|run.*deploy/);
});
