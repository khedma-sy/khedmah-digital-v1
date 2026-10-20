// Native PostgreSQL 16 reproduction. This suite never connects to PGHOST,
// Cloud SQL or an existing database: all SQL goes through docker exec into
// a newly created, network-disabled, disposable container with no mounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  // The image's temporary initialization server listens only on its socket.
  // Wait for final-server TCP readiness inside the network-disabled container.
  while (docker('exec', fixture, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres').status !== 0) {
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
  ok(sql("CREATE ROLE cloudsqlsuperuser NOLOGIN; CREATE DATABASE khedmah OWNER cloudsqlsuperuser TEMPLATE template0 LC_COLLATE 'en_US.utf8' LC_CTYPE 'en_US.utf8';",
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
  const baseline = () => assert.deepEqual(JSON.parse(ok(sql(pack.readonly), 'baseline preserved').join('\n')), pack.baseline);
  assert.equal(ok(sql(`SELECT
    (SELECT array_agg(n ORDER BY n COLLATE "default") FROM (VALUES ('max_redemptions'),('maximum_discount')) t(n)) <>
    (SELECT array_agg(n ORDER BY n COLLATE "C") FROM (VALUES ('max_redemptions'),('maximum_discount')) t(n));`), 'locale fixture')[0], 't');
  // The old implicit ordering must reproduce the defect under a non-C locale.
  const legacy = sql(pack.apply.replaceAll(' COLLATE "C"', ''));
  assert.notEqual(legacy.status, 0);
  assert.match(legacy.stderr, /RUNTIME_GRANTS_EXACT_ACL_MISMATCH/);
  baseline();
  const extraAcl = sql(pack.apply.replace(pack.grants, pack.grants +
    'GRANT SELECT ON public.category_taxonomy_022_before_image TO khedmah_runtime_role;\n'));
  assert.notEqual(extraAcl.status, 0);
  assert.match(extraAcl.stderr, /RUNTIME_GRANTS_EXACT_ACL_MISMATCH/);
  baseline();
  const changedSchema = sql(pack.apply.replace(pack.grants, pack.grants +
    'ALTER TABLE public.food_promo_codes ADD COLUMN unexpected_fixture text;\n'));
  assert.notEqual(changedSchema.status, 0);
  assert.match(changedSchema.stderr, /RUNTIME_GRANTS_SCHEMA_CHANGED/);
  baseline();
  const result = sql(pack.apply);
  if (result.status !== 0) {
    const after = sql(pack.readonly);
    t.diagnostic('Stopped fixture transaction SQL: ' + result.stderr);
    assert.deepEqual(JSON.parse(ok(after, 'state after stopped fixture attempt').join('\n')), pack.baseline);
    // Diagnosis is restricted to this disposable fixture and always rolls back.
    const comparison = JSON.parse(ok(sql('BEGIN READ WRITE;\n' + pack.grants +
      "SELECT jsonb_build_object('observed',(" + pack.inventory +
      ")::jsonb,'expected',(" + pack.expected + "));\nROLLBACK;"), 'fixture ACL comparison').join('\n'));
    const difference = {};
    for (const key of Object.keys(comparison.observed)) {
      const observed = comparison.observed[key], expected = comparison.expected[key];
      if (JSON.stringify(observed) === JSON.stringify(expected)) continue;
      if (Array.isArray(observed) && Array.isArray(expected)) {
        const observedSet = new Set(observed.map(row => JSON.stringify(row)));
        const expectedSet = new Set(expected.map(row => JSON.stringify(row)));
        difference[key] = {
          observed_only: observed.filter(row => !expectedSet.has(JSON.stringify(row))),
          expected_only: expected.filter(row => !observedSet.has(JSON.stringify(row))),
          counts: [observed.length, expected.length],
        };
      } else difference[key] = { observed, expected };
    }
    t.diagnostic('Disposable fixture ACL difference: ' + JSON.stringify(difference));
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
  const verifySource = run('python3', [fileURLToPath(new URL('./test_preview_v2_runtime_verify.py', import.meta.url)), '--sql-lab-pack']);
  assert.equal(verifySource.status, 0, verifySource.stderr);
  const verify = JSON.parse(verifySource.stdout);
  assert.equal(JSON.parse(ok(sql(verify.state), 'state reader').join('\n')).acl_state, 'EXPECTED_GRANTS_PRESENT');
  const runtime = JSON.parse(ok(sql(verify.runtime, 'khedmah_app'), 'runtime permissions').join('\n'));
  assert.equal(runtime.allowed_select_probes, 62);
  assert.equal(runtime.denied_select_probes, 2);

  // Run the real nine deployment entrypoints against the completed successor
  // schema and grants. The disposable container stays network-disabled.
  const root = fileURLToPath(new URL('..', import.meta.url));
  const migrationNames = [
    'foundation-nonproduction-migrations', 'product-store-nonproduction-migration',
    'classifieds-nonproduction-migration', 'fulfillment-nonproduction-migrations',
    'taxi-pricing-nonproduction-migration', 'billing-nonproduction-migration',
    'taxi-operational-approval-nonproduction-migration',
    'taxi-operational-profile-gate-nonproduction-migration', 'food-promotions-nonproduction-migration',
  ];
  ok(docker('cp', root + '/backend/migrations/versions', fixture + ':/migrations'), 'copy canonical SQL');
  ok(docker('cp', root + '/scripts/deployment', fixture + ':/schema-scripts'), 'copy real entrypoints');
  ok(docker('cp', root + '/scripts/deployment/reconcile-legacy-165-mobility-documents.sql',
    fixture + ':/migrations/reconcile_legacy_165_mobility_documents.sql'), 'copy retained legacy checksum source');
  ok(docker('cp', root + '/scripts/deployment/preview-schema-verification.sql',
    fixture + ':/migrations/preview-schema-verification.sql'), 'copy final verification');
  // Debian postgres lacks Python. Only the unchanged Git-blob hashing call is
  // translated to the same SHA1 algorithm; no SQL, query result or guard is mocked.
  const setup = `set -eu
mkdir -p /tmp/schema-tools
cat > /tmp/schema-tools/python3 <<'SH'
#!/bin/sh
set -eu
[ "$#" = 2 ] && [ "$1" = '-' ] && [ -f "$2" ] || exit 95
cat >/dev/null
( printf 'blob %s\\000' "$(wc -c < "$2" | tr -d ' ')"; cat "$2" ) | sha1sum | cut -d ' ' -f1
SH
cat > /tmp/schema-tools/psql <<'SH'
#!/bin/sh
set -eu
readonly_state="$(/usr/bin/psql -X -Atq -d "$DATABASE_URL" -c 'SHOW transaction_read_only;')"
[ "$readonly_state" = 'on' ] || exit 96
printf '%s\\n' "$readonly_state" >> /tmp/schema-sessions.log
exec /usr/bin/psql "$@"
SH
chmod 0555 /tmp/schema-tools/*
chmod -R a+rX /schema-scripts /migrations
`;
  ok(run('docker', ['exec', '-i', fixture, 'sh'], setup), 'read-only session recorder');
  const manifest = createHash('sha256').update(pack.migrations.slice(0, 22).map(m => m.sql).join('')).digest('hex');
  const runMigration = (name, mode = 'verify', extra = {}) => {
    const source = readFileSync(root + '/scripts/deployment/run-' + name + '.sh', 'utf8');
    const env = {
      PATH: '/tmp/schema-tools:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      DEPLOYMENT_ENVIRONMENT: 'preview', GOOGLE_CLOUD_PROJECT: 'khedmah-preview-v2-20261012',
      PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', MIGRATION_MODE: mode,
      DATABASE_URL: 'postgresql:///khedmah?user=khedmah_migrator',
      // The entrypoint must replace this unsafe inherited setting.
      PGOPTIONS: '-c default_transaction_read_only=off', FOUNDATION_MANIFEST_SHA256: manifest,
      MIGRATION_SHA256: source.match(/APPROVED_SHA256='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_036_SHA256: source.match(/APPROVED_036_SHA256='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_GIT_BLOB: source.match(/APPROVED_GIT_BLOB='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_033_SHA256: source.match(/APPROVED_033_SHA256='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_033_GIT_BLOB: source.match(/APPROVED_033_GIT_BLOB='([a-f0-9]+)'/)?.[1] ?? '',
      ...extra,
    };
    return run('docker', ['exec', ...Object.entries(env).flatMap(([k,v]) => ['--env', k + '=' + v]),
      fixture, 'sh', '/schema-scripts/run-' + name + '.sh']);
  };
  const snapshot = () => JSON.stringify({
    schema: ok(sql(pack.schema), 'schema digest'),
    acl: JSON.parse(ok(sql(pack.inventory), 'complete ACL metadata').join('\n')),
  });
  const completed = snapshot();
  for (const name of migrationNames) await t.test('read-only completed schema: ' + name, () => {
    const output = ok(runMigration(name), name);
    assert.ok(output.some(line => line.includes('ALREADY_APPLIED_AND_VERIFIED')));
    if (name.startsWith('food-')) assert.ok(output.includes('PREVIEW_V2_SCHEMA_AND_RUNTIME_ACL_READONLY_VERIFIED'));
    assert.equal(snapshot(), completed, 'Verification must preserve the full schema and exact ACLs.');
  });
  const sessions = ok(docker('exec', fixture, 'cat', '/tmp/schema-sessions.log'), 'session record');
  assert.ok(sessions.length >= 40 && sessions.every(line => line === 'on'));
  for (const name of migrationNames) {
    const refused = runMigration(name, 'apply');
    assert.equal(refused.status, 4, name);
    assert.match(refused.stderr, /PREVIEW_V2_SCHEMA_VERIFY_ONLY/);
  }
  assert.deepEqual(ok(docker('exec', fixture, 'cat', '/tmp/schema-sessions.log'), 'no apply connections'), sessions);

  await t.test('final verification rejects ACL drift, changed routine bodies and security', () => {
    const last = migrationNames.at(-1);
    const reject = () => assert.notEqual(runMigration(last).status, 0);
    ok(sql('GRANT SELECT ON public.category_taxonomy_022_before_image TO khedmah_runtime_role;',
      'khedmah_migrator', 'khedmah', false), 'fixture ACL drift');
    reject();
    ok(sql('REVOKE SELECT ON public.category_taxonomy_022_before_image FROM khedmah_runtime_role;',
      'khedmah_migrator', 'khedmah', false), 'restore fixture ACL');
    const signature = 'khedmah_taxi.resolve_actor_locked(text,boolean)';
    const definitionResult = sql(`SELECT pg_get_functiondef('${signature}'::regprocedure);`);
    assert.equal(definitionResult.status, 0, definitionResult.stderr);
    const definition = definitionResult.stdout.trim();
    ok(sql(definition.replace('b.visibility', 'b.visibility /* drift */'), 'khedmah_migrator', 'khedmah', false), 'body drift');
    reject();
    ok(sql(definition, 'khedmah_migrator', 'khedmah', false), 'restore function');
    ok(sql(`ALTER FUNCTION ${signature} SECURITY INVOKER;`, 'khedmah_migrator', 'khedmah', false), 'security drift');
    reject();
    ok(sql(definition, 'khedmah_migrator', 'khedmah', false), 'restore function security');
    ok(sql('ALTER TABLE public.media_assets DISABLE TRIGGER media_assets_pending_mobility_document_review;',
      'khedmah_migrator', 'khedmah', false), 'disable fixture trigger');
    reject();
    ok(sql('ALTER TABLE public.media_assets ENABLE TRIGGER media_assets_pending_mobility_document_review;',
      'khedmah_migrator', 'khedmah', false), 'restore fixture trigger');
    ok(runMigration(last), 'final restored verification');
  });
  await t.test('missing foundation/partial successor schema fails without repair', () => {
    ok(sql('ALTER TABLE public.categories RENAME COLUMN visual_key TO fixture_visual_key;',
      'khedmah_migrator', 'khedmah', false), 'foundation drift');
    const before = snapshot();
    assert.notEqual(runMigration(migrationNames[0]).status, 0);
    assert.equal(snapshot(), before);
    ok(sql('ALTER TABLE public.categories RENAME COLUMN fixture_visual_key TO visual_key;',
      'khedmah_migrator', 'khedmah', false), 'restore foundation');
    ok(sql('ALTER TABLE public.food_promo_codes RENAME TO fixture_food_promo_codes;',
      'khedmah_migrator', 'khedmah', false), 'partial promotion state');
    const partial = snapshot();
    assert.notEqual(runMigration(migrationNames.at(-1)).status, 0);
    assert.equal(snapshot(), partial);
    ok(sql('ALTER TABLE public.fixture_food_promo_codes RENAME TO food_promo_codes;',
      'khedmah_migrator', 'khedmah', false), 'restore promotion state');
    ok(sql('CREATE DATABASE empty_schema_fixture;', 'postgres', 'postgres', false), 'empty fixture');
    const empty = runMigration(migrationNames[0], 'verify', { DATABASE_URL: 'postgresql:///empty_schema_fixture?user=postgres' });
    assert.equal(empty.status, 42);
    assert.equal(ok(sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public';",
      'postgres', 'empty_schema_fixture'), 'empty remains empty')[0], '0');
  });
});
