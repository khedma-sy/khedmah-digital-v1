// SQL is executed only inside a newly created network-disabled PostgreSQL 16
// container. Never connect to PGHOST, Cloud SQL or any pre-existing database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const enabled = process.env.ALLOW_DESTRUCTIVE_DB_TESTS === 'true';
test('Prepared 036+037 transition is atomic and preserves authority on native PostgreSQL 16',
  { skip: !enabled, timeout: 240000 }, async t => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const fixture = 'khedmah-approval-transition-test-' + randomBytes(8).toString('hex');
  const run = (cmd, args, input) => spawnSync(cmd, args, {
    input, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
  const docker = (...args) => run('docker', args);
  assert.equal(docker('version', '--format', '{{.Server.Version}}').status, 0,
    'Native transition tests require Docker; there is no external-database fallback.');
  t.after(() => {
    assert.equal(docker('rm', '--force', fixture).status, 0,
      'The disposable transition container must be removed.');
  });
  const created = docker('run', '--detach', '--rm', '--network', 'none', '--name', fixture,
    '--env', 'POSTGRES_PASSWORD=' + randomBytes(24).toString('hex'), 'postgres:16');
  assert.equal(created.status, 0, created.stderr);
  const deadline = Date.now() + 45000;
  while (docker('exec', fixture, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres').status !== 0) {
    assert.ok(Date.now() < deadline, 'Disposable PostgreSQL startup timed out.');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const sql = (text, user = 'khedmah_migrator', database = 'khedmah') =>
    run('docker', ['exec', '-i', '--env', 'PGOPTIONS=-c role=none -c search_path=pg_catalog' +
      ' -c statement_timeout=120000 -c lock_timeout=5000', fixture,
      'psql', '-X', '-w', '-q', '-A', '-t', '-U', user, '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-P', 'pager=off'], text);
  const ok = (result, label) => {
    assert.equal(result.status, 0, label + ': ' + result.stderr);
    return result.stdout.trim();
  };
  assert.match(ok(sql('SHOW server_version_num;', 'postgres', 'postgres'), 'version'), /^16\d{4}$/);
  ok(sql("CREATE ROLE cloudsqlsuperuser NOLOGIN; CREATE DATABASE khedmah OWNER cloudsqlsuperuser TEMPLATE template0 LC_COLLATE 'en_US.utf8' LC_CTYPE 'en_US.utf8';",
    'postgres', 'postgres'), 'database fixture');
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
  `, 'postgres'), 'role fixture');
  // Reuse the retained real-schema fixture as setup, without replaying its
  // tests. The new tests below concern only this successor transition.
  const packed = run('python3', [root + '/tests/test_preview_v2_runtime_grants.py', '--sql-lab-pack']);
  assert.equal(packed.status, 0, packed.stderr);
  const baseline = JSON.parse(packed.stdout);
  for (const migration of baseline.migrations) {
    ok(sql('SET search_path=public;\n' + migration.sql), migration.name);
  }
  ok(sql(baseline.apply), 'retain previously reviewed runtime grants in fixture');
  const migration035 = readFileSync(root + '/backend/migrations/versions/035_specialized_admin_roles.sql', 'utf8');
  const migration036 = readFileSync(root + '/backend/migrations/versions/036_classifieds_rolling_publication_quota.sql', 'utf8');
  const source025 = readFileSync(root + '/backend/migrations/versions/025_classifieds.sql', 'utf8');
  const originalFunction = source025.match(/CREATE FUNCTION enforce_ad_free_slot_limit\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$[\s\S]*?\$\$;/)?.[0]
    .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
  assert.ok(originalFunction, 'The canonical 025 trigger function must be present in the fixture source.');
  ok(sql('SET search_path=public;\n' + migration035), 'observed 035 target fixture');
  ok(sql(`SET search_path=public;
    INSERT INTO core_user_accounts(user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
      VALUES ('transition_fixture_owner','identity_transition_fixture_owner','individual_user','active','active','private');
    INSERT INTO admin_roles(id,user_id,role) VALUES ('transition_fixture_role','transition_fixture_owner','platform_admin');
    INSERT INTO ad_listings(id,owner_user_id,kind,title_ar,category_code,price_mode,contact_mode,contact_value)
      SELECT 'transition_fixture_ad','transition_fixture_owner','sale','Fixture advertisement',code,'none','phone','00000000'
      FROM categories ORDER BY code LIMIT 1;
    INSERT INTO ad_free_slots(ad_id,owner_user_id,consumed_at)
      VALUES ('transition_fixture_ad','transition_fixture_owner',clock_timestamp()-interval '8 days');
  `), 'preserved nonempty application and role fixture');

  const prepared = run('python3', [root + '/tests/test_preview_v2_approval_transition.py', '--sql-lab-pack']);
  assert.equal(prepared.status, 0, prepared.stderr);
  const transition = JSON.parse(prepared.stdout).transition;
  const inspectionSource = run('python3', ['-B', '-c', `
import importlib.util, json, pathlib, sys
root=pathlib.Path(sys.argv[1])
spec=importlib.util.spec_from_file_location('transition_inspection',root/'scripts/read-preview-v2-approval-schema.py')
value=importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
print(json.dumps({'sql':value.build_quota_sql((root/'scripts/deployment/run-approval-prerequisites-035-037-nonproduction-migration.sh').read_bytes(),(root/'backend/migrations/versions/025_classifieds.sql').read_bytes())}))
`, root]);
  assert.equal(inspectionSource.status, 0, inspectionSource.stderr);
  const inspect = () => JSON.parse(ok(sql(JSON.parse(inspectionSource.stdout).sql), 'independent catalog read'));
  const dataQuery = `SELECT jsonb_build_object(
    'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.admin_roles r),
    'slots',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.ad_id) FROM public.ad_free_slots r),
    'media',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.media_assets r),
    'reviews',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.media_asset_id) FROM public.mobility_document_reviews r));`;
  const snapshot = () => ({
    schema: ok(sql(baseline.schema), 'schema snapshot'),
    acl: JSON.parse(ok(sql(baseline.inventory), 'ACL snapshot')),
    data: JSON.parse(ok(sql(dataQuery), 'application snapshot')),
    roleConstraint: ok(sql("SELECT oid::text||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.admin_roles'::regclass AND conname='admin_roles_role_check';"), '035 snapshot'),
  });
  const initial = inspect();
  assert.equal(initial.quota_diagnostics.body_025_exact, true);
  assert.equal(initial.role_target, true);
  assert.equal(initial.asset_predecessor, true);
  assert.equal(initial.private_constraint_absent, true);
  assert.deepEqual(initial.quota_diagnostics.routine_failed_checks, []);
  assert.deepEqual(initial.quota_diagnostics.trigger_failed_checks, []);

  await t.test('wrong database/session and privileged identity stop before mutation', () => {
    const before = snapshot();
    for (const [user, database] of [['postgres', 'khedmah'], ['khedmah_app', 'khedmah'], ['postgres', 'postgres']]) {
      const result = sql(transition, user, database);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /APPROVAL_TRANSITION_IDENTITY_MISMATCH/);
    }
    assert.deepEqual(snapshot(), before);
  });

  await t.test('unknown/mixed bodies and trigger, metadata, column or 035 drift are refused without repair', () => {
    const cases = [
      ['SET search_path=public;\n' + originalFunction.replace('>= 3', '>= 4'),
       'SET search_path=public;\n' + originalFunction],
      ['SET search_path=public;\n' + migration036,
       'SET search_path=public;\n' + originalFunction],
      ['ALTER TABLE public.ad_free_slots DISABLE TRIGGER ad_free_slot_limit_before_insert;',
       'ALTER TABLE public.ad_free_slots ENABLE TRIGGER ad_free_slot_limit_before_insert;'],
      ['ALTER FUNCTION public.enforce_ad_free_slot_limit() SET search_path=public;',
       'ALTER FUNCTION public.enforce_ad_free_slot_limit() RESET ALL;'],
      ["CREATE RULE transition_fixture_rule AS ON INSERT TO public.ad_free_slots DO INSTEAD NOTHING;",
       'DROP RULE transition_fixture_rule ON public.ad_free_slots;'],
      ['CREATE TRIGGER transition_fixture_trigger BEFORE INSERT ON public.ad_free_slots FOR EACH ROW EXECUTE FUNCTION public.enforce_ad_free_slot_limit();',
       'DROP TRIGGER transition_fixture_trigger ON public.ad_free_slots;'],
      ['ALTER TABLE public.media_assets ALTER COLUMN visibility DROP NOT NULL;',
       'ALTER TABLE public.media_assets ALTER COLUMN visibility SET NOT NULL;'],
      ["ALTER TABLE public.admin_roles DROP CONSTRAINT admin_roles_role_check, ADD CONSTRAINT admin_roles_role_check CHECK (role IN ('platform_admin'));",
       'SET search_path=public;\n' + migration035],
    ];
    for (const [drift, restore] of cases) {
      ok(sql(drift), 'install bounded drift fixture');
      const before = snapshot();
      const rejected = sql(transition);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /APPROVAL_TRANSITION_PREDECESSOR_MISMATCH/);
      assert.deepEqual(snapshot(), before, 'Rejected transition must not repair unknown drift.');
      ok(sql(restore), 'restore exact fixture');
    }
  });

  await t.test('active event triggers block the candidate before either migration', () => {
    ok(sql(`CREATE FUNCTION public.transition_fixture_event() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN RETURN; END$$;
      CREATE EVENT TRIGGER transition_fixture_event ON ddl_command_end EXECUTE FUNCTION public.transition_fixture_event();`, 'postgres'), 'event trigger fixture');
    const before = snapshot();
    const result = sql(transition);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /APPROVAL_TRANSITION_EVENT_TRIGGER_PRESENT/);
    assert.deepEqual(snapshot(), before);
    ok(sql('DROP EVENT TRIGGER transition_fixture_event; DROP FUNCTION public.transition_fixture_event();', 'postgres'), 'remove event trigger fixture');
  });

  await t.test('a failure after 036 rolls the function and all other state back', () => {
    const before = snapshot();
    const failed = transition.replace(' EXECUTE $migration037$',
      " RAISE EXCEPTION 'TRANSITION_FIXTURE_FAILURE_AFTER_036';\n EXECUTE $migration037$");
    assert.notEqual(failed, transition);
    const result = sql(failed);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TRANSITION_FIXTURE_FAILURE_AFTER_036/);
    assert.deepEqual(snapshot(), before);
    assert.equal(inspect().quota_diagnostics.body_025_exact, true);
  });

  await t.test('target verification and preserved-ACL checks roll back failed successors', () => {
    const before = snapshot();
    const badTarget = transition.replace("interval '24 hours'", "interval '23 hours'");
    const targetResult = sql(badTarget);
    assert.notEqual(targetResult.status, 0);
    assert.match(targetResult.stderr, /APPROVAL_TRANSITION_TARGET_MISMATCH/);
    assert.deepEqual(snapshot(), before);
    const badAcl = transition.replace(" PERFORM pg_catalog.set_config('search_path','pg_catalog',true);",
      " REVOKE SELECT ON public.ad_free_slots FROM khedmah_runtime_role;\n PERFORM pg_catalog.set_config('search_path','pg_catalog',true);");
    const aclResult = sql(badAcl);
    assert.notEqual(aclResult.status, 0);
    assert.match(aclResult.stderr, /APPROVAL_TRANSITION_PRESERVED_METADATA_CHANGED/);
    assert.deepEqual(snapshot(), before);
  });

  await t.test('a concurrent table reader produces a bounded lock refusal without changes', async () => {
    const before = snapshot();
    const holder = spawn('docker', ['exec', '-i', fixture, 'psql', '-X', '-q', '-A', '-t', '-U', 'khedmah_migrator', '-d', 'khedmah', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const closed = new Promise(resolve => holder.on('close', resolve));
    let holderPid;
    try {
      const ready = new Promise((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(new Error('Fixture lock holder did not become ready.')), 10000);
        holder.stdout.on('data', chunk => {
          output += chunk.toString();
          const match = output.match(/TRANSITION_LOCK_HELD:(\d+)/);
          if (match) { holderPid = Number(match[1]); clearTimeout(timer); resolve(); }
        });
        holder.on('error', error => { clearTimeout(timer); reject(error); });
      });
      holder.stdin.end("BEGIN; LOCK TABLE public.ad_free_slots IN ACCESS SHARE MODE; SELECT 'TRANSITION_LOCK_HELD:'||pg_backend_pid(); SELECT pg_sleep(30); ROLLBACK;\n");
      await ready;
      const start = Date.now();
      const result = sql(transition);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /lock timeout/);
      assert.ok(Date.now() - start < 15000, 'Configured lock timeout must bound this conflict.');
    } finally {
      if (Number.isInteger(holderPid)) ok(sql('SELECT pg_terminate_backend(' + holderPid + ');', 'postgres'), 'release fixture blocker');
      else holder.kill('SIGTERM');
      await closed;
    }
    assert.deepEqual(snapshot(), before);
  });

  await t.test('canonical predecessor commits both targets while preserving data, ACLs and 035; replay refuses', () => {
    const before = snapshot();
    ok(sql(transition), 'prepared successor transaction');
    const after = snapshot();
    assert.notEqual(after.schema, before.schema);
    assert.deepEqual(after.acl, before.acl);
    assert.deepEqual(after.data, before.data);
    assert.equal(after.roleConstraint, before.roleConstraint);
    const target = inspect();
    assert.equal(target.classification, 'target');
    assert.equal(target.role_target, true);
    assert.equal(target.asset_target, true);
    assert.equal(target.private_constraint_target, true);
    assert.equal(target.quota_target, true);
    assert.equal(target.quota_diagnostics.body_036_exact, true);
    const replay = sql(transition);
    assert.notEqual(replay.status, 0);
    assert.match(replay.stderr, /APPROVAL_TRANSITION_PREDECESSOR_MISMATCH/);
    assert.deepEqual(snapshot(), after);
  });
});
