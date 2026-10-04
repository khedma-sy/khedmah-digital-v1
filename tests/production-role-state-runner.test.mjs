import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/production-database-role-bootstrap.yml', import.meta.url), 'utf8');
const start = '      - name: Classify resumable prepare role state\n';
const end = '      - name: Rotate migration password before runtime cutover\n';
const section = workflow.split(start)[1]?.split(end)[0];
assert.ok(section, 'The real PREPARE classifier step must exist.');
const run = section.split('        run: |\n')[1];
assert.ok(run, 'The classifier must expose an inline Bash body.');
const body = run.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');

// A closed command allowlist intercepts every cloud call. No credentials or
// network access are used; commands outside the probe are rejected explicitly.
const mock = `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.FIXTURE_ROOT;
const config = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const command = args.slice(0, 4).join(' ');
const out = text => process.stdout.write(text + '\\n');
const trace = entry => appendFileSync(join(root, 'calls.jsonl'), JSON.stringify(entry) + '\\n');
if (args.slice(0, 3).join(' ') === 'sql users list') {
  out(JSON.stringify(config.users ?? [
    {name: 'postgres', type: 'BUILT_IN'},
    {name: 'runtime_test', type: 'BUILT_IN'},
    {name: 'migration_test', type: 'BUILT_IN'}
  ]));
} else if (args.slice(0, 2).join(' ') === 'secrets describe') {
  out(JSON.stringify({versionAliases: config.noActive ? {} : {active: '2'}}));
} else if (args.slice(0, 3).join(' ') === 'secrets versions describe') {
  out('ENABLED');
} else if (args.slice(0, 3).join(' ') === 'secrets versions list') {
  for (const v of config.versions ?? ['3', '2']) out('projects/test/secrets/DATABASE_MIGRATION_URL/versions/' + v);
} else if (command === 'run jobs deploy khedmah-database-role-state') {
  const index = args.indexOf('--set-secrets');
  const selector = args[index + 1].split(':').pop();
  trace({operation: 'deploy', selector});
  const behavior = config.selectors[selector] ?? {kind: 'auth-failure'};
  if (behavior.kind === 'deploy-failure') process.exit(1);
  writeFileSync(join(root, 'selector'), selector);
} else if (command === 'run jobs execute khedmah-database-role-state') {
  const selector = readFileSync(join(root, 'selector'), 'utf8');
  trace({operation: 'execute', selector});
  const behavior = config.selectors[selector] ?? {kind: 'auth-failure'};
  if (behavior.kind === 'unresolved') {out('unresolved execution'); process.exit(1);}
  out('khedmah-database-role-state-probe' + selector);
  if (behavior.kind === 'auth-failure' || behavior.kind === 'failed-with-marker') process.exit(1);
} else if (args.slice(0, 2).join(' ') === 'logging read') {
  const selector = readFileSync(join(root, 'selector'), 'utf8');
  const behavior = config.selectors[selector] ?? {kind: 'auth-failure'};
  if (behavior.kind === 'auth-failure') out('ERROR: fixture credential rejected');
  else if (behavior.kind !== 'no-marker') out('DATABASE_ROLE_PREPARE_STATE=' + (behavior.state ?? 'invalid'));
} else {
  trace({operation: 'FORBIDDEN', args});
  process.stderr.write('Forbidden cloud command in read-only fixture\\n');
  process.exit(99);
}
`;

async function fixture(config) {
  const root = await mkdtemp(join(tmpdir(), 'khedmah-role-state-'));
  try {
    const bin = join(root, 'bin');
    await mkdir(bin);
    await writeFile(join(root, 'config.json'), JSON.stringify(config));
    await writeFile(join(root, 'calls.jsonl'), '');
    await writeFile(join(root, 'output'), '');
    await writeFile(join(bin, 'gcloud'), mock, { mode: 0o755 });
    await writeFile(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', body], {
      encoding: 'utf8', timeout: 15000,
      env: {
        PATH: bin + ':/usr/bin:/bin', HOME: root, FIXTURE_ROOT: root,
        GOOGLE_CLOUD_PROJECT: 'khedmah-fixture', GOOGLE_CLOUD_REGION: 'europe-west1',
        CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'khedmah-fixture:europe-west1:fixture-db',
        OPERATIONS_ARTIFACT_REPOSITORY: 'fixture',
        OPERATIONS_MIGRATION_SERVICE_ACCOUNT: 'fixture@khedmah-fixture.iam.gserviceaccount.com',
        REQUESTED_SHA: 'a'.repeat(40), DATABASE_RUNTIME_USER: 'runtime_test',
        DATABASE_MIGRATION_USER: 'migration_test', DATABASE_RUNTIME_ROLE: 'runtime_role_test',
        DATABASE_MIGRATION_ROLE: 'migration_role_test', DATABASE_NAME: 'khedmah_test',
        GITHUB_OUTPUT: join(root, 'output')
      }
    });
    assert.ifError(result.error);
    const output = await readFile(join(root, 'output'), 'utf8');
    const calls = (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.ok(!calls.some(call => call.operation === 'FORBIDDEN'), 'No mutation/secret-payload command may be called.');
    return {...result, output, calls};
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

for (const state of ['initial', 'resume', 'completed']) {
  test('role-state runner accepts a successful ' + state + ' probe', async () => {
    const r = await fixture({selectors: {active: {state}}});
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.output, 'state=' + state + '\ncredential_selector=active\n');
    assert.deepEqual(r.calls, [{operation: 'deploy', selector: 'active'}, {operation: 'execute', selector: 'active'}]);
  });
}

test('role-state runner continues after a stale active credential', async () => {
  const r = await fixture({selectors: {active: {kind: 'auth-failure'}, '3': {state: 'resume'}}});
  assert.equal(r.status, 0, 'A stale active credential must not terminate the shell before trying a numeric version.\n' + r.stderr);
  assert.equal(r.output, 'state=resume\ncredential_selector=3\n');
  assert.deepEqual(r.calls.filter(c => c.operation === 'execute').map(c => c.selector), ['active', '3']);
});

test('role-state runner reports invalid membership and never tries another credential', async () => {
  const r = await fixture({selectors: {active: {state: 'invalid'}, '3': {state: 'initial'}}});
  assert.equal(r.status, 1);
  assert.equal(r.output, '');
  assert.match(r.stderr, /Cloud SQL database role state is not a resumable PREPARE state/);
  assert.deepEqual(r.calls.filter(c => c.operation === 'execute').map(c => c.selector), ['active']);
});

test('role-state runner exhausts rejected credentials without publishing success', async () => {
  const r = await fixture({selectors: {}});
  assert.equal(r.status, 1);
  assert.equal(r.output, '');
  assert.match(r.stderr, /no enabled migration credential could authenticate/);
  assert.deepEqual(r.calls.filter(c => c.operation === 'execute').map(c => c.selector), ['active', '3', '2']);
});

test('role-state runner never executes a stale job after a failed deploy', async () => {
  const r = await fixture({selectors: {active: {kind: 'deploy-failure'}, '3': {state: 'initial'}}});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.output, 'state=initial\ncredential_selector=3\n');
  assert.deepEqual(r.calls.filter(c => c.operation === 'execute').map(c => c.selector), ['3']);
});

test('role-state runner rejects a success marker from a failed execution', async () => {
  const r = await fixture({selectors: {active: {kind: 'failed-with-marker', state: 'completed'}, '3': {state: 'resume'}}});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.output, 'state=resume\ncredential_selector=3\n');
});

test('role-state runner rejects unexpected users before deploying a probe', async () => {
  const r = await fixture({users: [{name: 'unexpected', type: 'BUILT_IN'}], selectors: {active: {state: 'initial'}}});
  assert.notEqual(r.status, 0);
  assert.equal(r.output, '');
  assert.deepEqual(r.calls, []);
});
