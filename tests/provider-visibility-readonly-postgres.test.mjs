import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SQL = readFileSync(
  new URL('../scripts/diagnostics/provider-visibility-readonly.sql', import.meta.url),
  'utf8',
);

// Never use an operator-supplied database connection: a fresh no-network
// PostgreSQL container is the only database reached by this test.
const permittedCI = process.env.GITHUB_ACTIONS === 'true'
  && process.env.ALLOW_DESTRUCTIVE_DB_TESTS === 'true';

function docker(args, input, timeout = 30_000) {
  return spawnSync('docker', args, {
    input, encoding: 'utf8', timeout, maxBuffer: 2_000_000,
    env: { ...process.env, DOCKER_HOST: 'unix:///var/run/docker.sock' },
  });
}
function diagnostic(result) {
  return [result.error?.message, result.stdout, result.stderr]
    .filter(Boolean).join('\n').slice(0, 3_000);
}

test('provider visibility SQL executes read-only on isolated PostgreSQL 16 fixture', {
  skip: permittedCI ? false : 'Requires opt-in disposable database CI',
  timeout: 150_000,
}, async t => {
  const version = docker(['info', '--format', '{{.ServerVersion}}']);
  assert.equal(version.status, 0, 'Live SQL validation requires a local Docker daemon');
  const container = 'khedmah-visibility-ci-' + process.pid + '-' + randomBytes(5).toString('hex');
  const started = docker([
    'run', '-d', '--rm', '--network', 'none', '--name', container,
    '--env', 'POSTGRES_PASSWORD=local_fixture_only',
    '--env', 'POSTGRES_DB=khedmah', 'postgres:16.15-alpine',
  ], undefined, 90_000);
  assert.equal(started.status, 0, 'Cannot start isolated PostgreSQL: ' + diagnostic(started));
  t.after(() => {
    const removed = docker(['rm', '-f', container]);
    assert.equal(removed.status, 0, 'Fixture cleanup failed: ' + diagnostic(removed));
  });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'khedmah']);
    if (probe.status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(ready, true, 'Disposable PostgreSQL never became ready');

  const psql = (source, database = 'khedmah') => docker([
    'exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-F', '|',
  ], source);

  const setup = psql([
    'CREATE TABLE public.business_profiles (name text NOT NULL, visibility text NOT NULL,',
    '  moderation_status text NOT NULL, trust_status text NOT NULL, status text NOT NULL,',
    '  lat numeric, lng numeric);',
    'CREATE TABLE public.professional_profiles (visibility text NOT NULL,',
    '  moderation_status text NOT NULL, lifecycle_status text NOT NULL);',
    'INSERT INTO public.business_profiles VALUES',
    "('eligible with location','public','approved','approved','active',33,36),",
    "('eligible city only','public','approved','approved','active',NULL,NULL),",
    "('private default','private','pending','pending','active',NULL,NULL),",
    "('trust held','public','approved','pending','active',34,35),",
    "('khedmah production test','public','approved','approved','active',34,35),",
    "('invalid coordinate','public','approved','approved','active',97,36);",
    'INSERT INTO public.professional_profiles VALUES',
    "('public','approved','active'), ('private','pending','created'),",
    "('public','approved','pending'), ('internal','pending','archived'),",
    "('public','pending','active');",
  ].join('\n'));
  assert.equal(setup.status, 0, 'Cannot prepare synthetic fixture: ' + diagnostic(setup));

  const inspector = psql(SQL);
  assert.equal(inspector.status, 0, 'Read-only SQL did not execute: ' + diagnostic(inspector));
  assert.deepEqual(inspector.stdout.trim().split(/\r?\n/), [
    'business|6|1|0|5|1|5|2|4|0|0|0|0|3|1|2',
    'professional|5|1|1|3|3|2|0|0|0|1|1|1|1||',
  ], 'Aggregates must match exact synthetic business and professional states');

  const unchanged = psql([
    'SELECT (SELECT COUNT(*) FROM public.business_profiles),',
    '       (SELECT COUNT(*) FROM public.professional_profiles);',
  ].join('\n'));
  assert.equal(unchanged.status, 0, diagnostic(unchanged));
  assert.equal(unchanged.stdout.trim(), '6|5', 'Inspector must not modify rows');

  const wrongDatabase = psql(SQL, 'postgres');
  assert.notEqual(wrongDatabase.status, 0, 'Wrong database must fail closed');
  assert.match(wrongDatabase.stderr, /STOP: PROVIDER_VISIBILITY_READ_ONLY_GATE_FAILED/);

  const forbiddenWrite = psql([
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;',
    'INSERT INTO public.business_profiles (name, visibility, moderation_status, trust_status, status)',
    "VALUES ('forbidden', 'public', 'approved', 'approved', 'active');",
    'ROLLBACK;',
  ].join('\n'));
  assert.notEqual(forbiddenWrite.status, 0);
  assert.match(forbiddenWrite.stderr, /read.only transaction/i);
});
