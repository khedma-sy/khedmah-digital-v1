import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertSourceInventory } from '../scripts/deployment/verify-build-source-exclusions.mjs';
const positive='Dockerfile\npackage.json\nscripts/probe.sql\nnested/keep.txt\n';
test('archive assertions reject root/nested credential files and missing required build inputs',()=>{
 assertSourceInventory(positive);
 for(const file of ['gha-creds-fixture.json','nested/gha-creds-fixture.json','deep/nested/gha-creds-.json'])assert.throws(()=>assertSourceInventory(positive+file),/TRANSIENT_CREDENTIAL_INCLUDED/);
 for(const file of positive.trim().split('\n'))assert.throws(()=>assertSourceInventory(positive.replace(file+'\n','')),/REQUIRED_FIXTURE_FILE_MISSING/);
});
test('all three packaging boundaries explicitly exclude transient auth files; real native tooling gates Preview before authentication',()=>{
 for(const file of ['.gitignore','.gcloudignore','.dockerignore'])assert.match(readFileSync(file,'utf8'),/^gha-creds-\*\.json$/m);
 assert.match(readFileSync('.gcloudignore','utf8'),/^#!include:\.gitignore$/m);
 const workflow=readFileSync('.github/workflows/preview-deployment.yml','utf8');
 assert.ok(workflow.indexOf('run: node scripts/deployment/verify-build-source-exclusions.mjs')<workflow.indexOf('  deploy-preview:'));
 const deploy=workflow.split('      - id: deploy\n')[1].split('  resolve-staging-baseline:')[0];
 assert.match(deploy,/CLOUDSDK_GCLOUDIGNORE_ENABLED: 'true'/);
});
