import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(new URL('..', import.meta.url).pathname);
const script = resolve(root, 'scripts/deployment/validate-staging-cloud-resources.sh');

function fixture(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'khedmah-staging-cloud-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'calls.jsonl');
  const fake = `#!/usr/bin/env node
const fs=require('node:fs');
const a=process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify(a)+'\\n');
if(a[0]==='services'&&a[1]==='describe'){
  console.log(a[2]===process.env.MOCK_DISABLED_API?'DISABLED':'ENABLED');
  process.exit(0);
}
if(a[0]==='artifacts'&&a[1]==='repositories'&&a[2]==='describe') process.exit(process.env.MOCK_MISSING_REPO==='1'?1:0);
if(a[0]==='sql'&&a[1]==='instances'&&a[2]==='describe'){
  if(process.env.MOCK_MISSING_SQL==='1') process.exit(1);
  console.log(process.env.MOCK_SQL_CONNECTION);
  process.exit(0);
}
if(a[0]==='secrets'&&a[1]==='versions'&&a[2]==='describe'){
  const i=a.indexOf('--secret');
  const name=i>=0?a[i+1]:'';
  console.log(name===process.env.MOCK_DISABLED_SECRET?'DISABLED':'ENABLED');
  process.exit(0);
}
process.exit(9);
`;
  writeFileSync(join(bin, 'gcloud'), fake, { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    MOCK_LOG: log,
    GOOGLE_CLOUD_PROJECT: 'khedmah-staging',
    GOOGLE_CLOUD_REGION: 'me-central1',
    ARTIFACT_REPOSITORY: 'khedmah-staging',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'khedmah-staging:me-central1:khedmah-staging-db',
    GCS_MEDIA_BUCKET: 'khedmah-staging-media',
    PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedmah-production',
    MOCK_SQL_CONNECTION: 'khedmah-staging:me-central1:khedmah-staging-db',
    ...overrides
  };
  return {
    run() { return spawnSync('bash', [script], { cwd: root, env, encoding: 'utf8' }); },
    calls() { try { return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } },
    close() { rmSync(dir, { recursive: true, force: true }); }
  };
}

test('staging cloud-resource preflight verifies APIs, repository, SQL and enabled secret versions without reading secret payloads', () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /cloud resource preflight passed/);
    const calls = f.calls();
    assert.ok(calls.some(a => a[0] === 'sql' && a[1] === 'instances' && a[2] === 'describe'));
    assert.ok(calls.some(a => a[0] === 'artifacts' && a[1] === 'repositories' && a[2] === 'describe'));
    const secretCalls = calls.filter(a => a[0] === 'secrets');
    assert.ok(secretCalls.length >= 10);
    for (const args of secretCalls) {
      assert.deepEqual(args.slice(0, 3), ['secrets', 'versions', 'describe']);
      assert.equal(args[3], 'latest');
      assert.ok(args.includes('--secret'));
      assert.ok(!args.includes('access'));
    }
    const joined = calls.flat().join(' ');
    assert.doesNotMatch(joined, /services enable|run deploy|builds submit|versions access/);
  } finally { f.close(); }
});

test('staging cloud-resource preflight fails closed for disabled APIs before deployment', () => {
  const f = fixture({ MOCK_DISABLED_API: 'run.googleapis.com' });
  try {
    const result = f.run();
    assert.equal(result.status, 4);
    assert.match(result.stderr, /run\.googleapis\.com/);
    assert.doesNotMatch(result.stderr, /khedmah-staging-db/);
  } finally { f.close(); }
});

test('staging cloud-resource preflight rejects missing or disabled required secrets without exposing values', () => {
  const f = fixture({ MOCK_DISABLED_SECRET: 'DATABASE_URL' });
  try {
    const result = f.run();
    assert.equal(result.status, 7);
    assert.match(result.stderr, /DATABASE_URL/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /postgresql:\/\//i);
  } finally { f.close(); }
});

test('staging cloud-resource preflight rejects a Cloud SQL instance that does not match the protected connection name', () => {
  const f = fixture({ MOCK_SQL_CONNECTION: 'khedmah-staging:me-central1:other-db' });
  try {
    const result = f.run();
    assert.equal(result.status, 6);
    assert.match(result.stderr, /Cloud SQL instance/);
    assert.doesNotMatch(result.stderr, /other-db/);
  } finally { f.close(); }
});

test('staging cloud-resource preflight refuses Production before any gcloud call', () => {
  const f = fixture({ GOOGLE_CLOUD_PROJECT: 'khedmah-production' });
  try {
    const result = f.run();
    assert.equal(result.status, 3);
    assert.match(result.stderr, /Refusing/);
    assert.equal(f.calls().length, 0);
  } finally { f.close(); }
});
