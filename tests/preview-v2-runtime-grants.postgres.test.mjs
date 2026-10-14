// Native PostgreSQL 16 reproduction. This suite never connects to PGHOST,
// Cloud SQL or an existing database: all SQL goes through docker exec into
// a newly created, network-disabled, disposable container with no mounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const enabled = process.env.ALLOW_DESTRUCTIVE_DB_TESTS === 'true';
test('Preview runtime grant executes the complete contract on native PostgreSQL 16',
  { skip: !enabled, timeout: 180000 }, async t => {
  const fixture = 'khedmah-preview-acl-test-' + randomBytes(8).toString('hex');
  const run = (cmd, args, input) => spawnSync(cmd, args, {
    input, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024,
  });
  const docker = (...args) => run('docker', args);
  assert.equal(docker('version', '--format', '{{.Server.Version}}').status, 0,
    'Native Preview grant regression requires Docker; no fallback to an existing database.');
  t.after(() => {
    const result = docker('rm', '--force', fixture);
    assert.equal(result.status, 0, 'Failed to remove the disposable Preview grant test container.');
  });
  const created = docker('run', '--detach', '--rm', '--network', 'none', '--name', fixture,
    '--env', 'POSTGRES_PASSWORD=' + randomBytes(24).toString('hex'), 'postgres:16');
  assert.equal(created.status, 0, created.stderr);
  const deadline = Date.now() + 45000;
  while (docker('exec', fixture, 'pg_isready', '-U', 'postgres').status !== 0) {
    assert.ok(Date.now() < deadline, 'Disposable PostgreSQL 16 startup timed out.');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const sql = (text, user = 'khedmah_migrator', database = 'khedmah', readonly = true) =>
    run('docker', ['exec', '-i', '--env', 'PGOPTIONS=-c role=none -c search_path=pg_catalog' +
      (readonly ? ' -c default_transaction_read_only=on' : '') +
      ' -c statement_timeout=120000 -c lock_timeout=5000', fixture,
      'psql', '-X', '-w', '-q', '-A', '-t', '-U', user, '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-P', 'pager=off'], text);
  const ok = (result, stage) => {
    assert.equal(result.status, 0, stage + ': ' + result.stderr);
    return result.stdout.split('\n').map(line => line.trim()).filter(Boolean);
  };
  assert.match(ok(sql('SHOW server_version_num;', 'postgres', 'postgres', false), 'version')[0], /^16\d{4}$/);
  ok(sql('CREATE ROLE cloudsqlsuperuser NOLOGIN; CREATE DATABASE khedmah OWNER cloudsqlsuperuser;',
    'postgres', 'postgres', false), 'create isolated database');
  ok(sql(`
    CREATE ROLE khedmah_runtime_role NOLOGIN;
    CREATE ROLE khedmah_migration_role NOLOGIN;
    CREATE ROLE khedmah_app LOGIN;
    CREATE ROLE khedmah_migrator LOGIN;
    GRANT khedmah_runtime_role TO khedmah_app;
    GRANT khedmah_migration_role TO khedmah_migrator;
    REVOKE ALL ON DATABASE khedmah FROM PUBLIC;
    GRANT CONNECT ON DATABASE khedmah TO khedmah_runtime_role,khedmah_migration_role;
    GRANT CREATE ON DATABASE khedmah TO khedmah_migration_role;
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO khedmah_runtime_role;
    GRANT USAGE,CREATE ON SCHEMA public TO khedmah_migration_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE khedmah_migration_role REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE khedmah_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  `, 'postgres', 'khedmah', false), 'role fixture');
  const packed = run('python3', [fileURLToPath(new URL('./test_preview_v2_runtime_grants.py', import.meta.url)), '--sql-lab-pack']);
  assert.equal(packed.status, 0, packed.stderr);
  const pack = JSON.parse(packed.stdout);
  for (const migration of pack.migrations) {
    ok(sql('SET search_path=public,pg_catalog;\n' + migration.sql, 'khedmah_migrator', 'khedmah', false), migration.name);
  }
  // Keep every retained contract and the published SQL unchanged. In
  // particular, do not discard the PG16 guards or normalize SQL output.
  // PostgreSQL json_agg(record) may embed newlines in a single JSON value.
  assert.deepEqual(JSON.parse(ok(sql(pack.readonly), 'full preflight').join('\n')), pack.baseline);
  const result = sql(pack.apply);
  if (result.status !== 0) {
    const after = sql(pack.readonly);
    t.diagnostic('Stopped fixture transaction SQL: ' + result.stderr);
    assert.deepEqual(JSON.parse(ok(after, 'state after stopped fixture attempt').join('\n')), pack.baseline);
  }
  const lines = ok(result, 'grant transaction');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], 'PREVIEW_V2_RUNTIME_GRANTS_COMMIT_ACK');
  const receipt = JSON.parse(lines[0]);
  assert.equal(receipt.acl_exact, true);
  assert.match(receipt.schema_digest, /^[0-9a-f]{64}$/);
  const readback = pack.readback.replaceAll('12'.repeat(32), receipt.schema_digest);
  assert.deepEqual(ok(sql(readback), 'readback'), ['PREVIEW_V2_RUNTIME_GRANTS_READBACK_ACK']);
  const replay = sql(pack.apply);
  assert.notEqual(replay.status, 0, 'Completed grants must reject replay.');
  assert.deepEqual(ok(sql(readback), 'readback after rejected replay'), ['PREVIEW_V2_RUNTIME_GRANTS_READBACK_ACK']);
});
