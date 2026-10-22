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

  const root = fileURLToPath(new URL('..', import.meta.url));
  const inspectionSource = run('python3', ['-B', '-c', `
import importlib.util, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('approval_catalog_fixture', root / 'scripts/read-preview-v2-approval-schema.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
runner = (root / 'scripts/deployment/run-approval-prerequisites-035-037-nonproduction-migration.sh').read_bytes()
predecessor = (root / 'backend/migrations/versions/025_classifieds.sql').read_bytes()
print(json.dumps({'approval': reader.build_sql(runner), 'quota': reader.build_quota_sql(runner, predecessor)}))
`, root]);
  assert.equal(inspectionSource.status, 0, inspectionSource.stderr);
  const inspection = JSON.parse(inspectionSource.stdout);
  const snapshot = () => JSON.stringify({
    schema: ok(sql(pack.schema), 'schema digest'),
    acl: JSON.parse(ok(sql(pack.inventory), 'complete ACL metadata').join('\n')),
  });
  const canonicalQuotaDiagnostic = {
    routine_count: 1, body_025_exact: false, body_036_exact: true,
    routine_failed_checks: [], named_trigger_count: 1, trigger_failed_checks: [],
    user_insert_trigger_count: 1, insert_rule_count: 0,
  };
  const inspectQuota = (label, expected = {}, quotaTarget = false) => {
    const value = JSON.parse(ok(sql(inspection.quota), label).join('\n'));
    assert.equal(value.database, 'khedmah');
    assert.equal(value.user, 'khedmah_migrator');
    assert.equal(value.session_user, 'khedmah_migrator');
    assert.equal(value.read_only, 'on');
    assert.equal(value.isolation, 'repeatable read');
    assert.equal(value.quota_target, quotaTarget, label + ': canonical quota result');
    assert.deepEqual(value.quota_diagnostics, { ...canonicalQuotaDiagnostic, ...expected }, label);
    return value;
  };
  const assertInspectionAgreement = (value, label) => {
    const catalog = { ...value };
    delete catalog.quota_diagnostics;
    assert.deepEqual(catalog, JSON.parse(ok(sql(inspection.approval), label).join('\n')),
      'The diagnostic must retain the original canonical catalog classification.');
  };
  // The retained ACL baseline intentionally validates the reviewed 030 routine
  // body first. Migration 036 remains owned by Classifieds; the real governed
  // entrypoint below must apply 035 and 037 rather than fixture SQL doing so.
  await t.test('quota catalog distinguishes canonical 025 and 036 without changing either state', () => {
    const before036 = snapshot();
    const predecessor = inspectQuota('canonical 025 quota diagnosis', {
      body_025_exact: true, body_036_exact: false,
    });
    assert.equal(predecessor.classification, 'prerequisite-invalid');
    assertInspectionAgreement(predecessor, 'canonical reader before 036');
    assert.equal(snapshot(), before036, 'Diagnosing the old quota must not install 036.');

    ok(sql('SET search_path=public,pg_catalog;\n' +
      readFileSync(root + '/backend/migrations/versions/036_classifieds_rolling_publication_quota.sql', 'utf8'),
      'khedmah_migrator', 'khedmah', false), 'classifieds quota migration fixture');
    const after036 = snapshot();
    const target = inspectQuota('canonical 036 quota diagnosis', {}, true);
    assert.equal(target.classification, 'predecessor');
    assertInspectionAgreement(target, 'canonical reader after 036');
    assert.equal(snapshot(), after036, 'Diagnosing 036 must preserve the complete schema and ACLs.');
  });

  // Run the real ten deployment entrypoints against the completed successor
  // schema and grants. The disposable container stays network-disabled.
  const migrationNames = [
    'foundation-nonproduction-migrations', 'product-store-nonproduction-migration',
    'classifieds-nonproduction-migration', 'fulfillment-nonproduction-migrations',
    'taxi-pricing-nonproduction-migration', 'billing-nonproduction-migration',
    'taxi-operational-approval-nonproduction-migration',
    'taxi-operational-profile-gate-nonproduction-migration', 'food-promotions-nonproduction-migration',
    'approval-prerequisites-035-037-nonproduction-migration',
  ];
  ok(docker('cp', root + '/backend/migrations/versions', fixture + ':/migrations'), 'copy canonical SQL');
  ok(docker('cp', root + '/scripts/deployment', fixture + ':/schema-scripts'), 'copy real entrypoints');
  ok(docker('cp', root + '/scripts/deployment/reconcile-legacy-165-mobility-documents.sql',
    fixture + ':/migrations/reconcile_legacy_165_mobility_documents.sql'), 'copy retained legacy checksum source');
  ok(docker('cp', root + '/scripts/deployment/preview-schema-verification.sql',
    fixture + ':/migrations/preview-schema-verification.sql'), 'copy final verification');
  // Debian postgres lacks Python. The adapter implements only the reviewed
  // Git-blob hash and the one hostless local-test URL; SQL and catalog guards
  // still execute unchanged on native PostgreSQL.
  const setup = `set -eu
mkdir -p /tmp/schema-tools
cat > /tmp/schema-tools/python3 <<'SH'
#!/bin/sh
set -eu
if [ "$#" = 2 ] && [ "$1" = '-' ] && [ -f "$2" ]; then
  cat >/dev/null
  ( printf 'blob %s\\000' "$(wc -c < "$2" | tr -d ' ')"; cat "$2" ) | sha1sum | cut -d ' ' -f1
elif [ "$#" = 1 ] && [ "$1" = '-' ] && [ "$DATABASE_URL" = 'postgresql:///khedmah?user=khedmah_migrator' ]; then
  grep -q 'local tests require a hostless URL' || exit 95
  printf '%s\\n' 'PGDATABASE=khedmah' 'PGUSER=khedmah_migrator' 'PGHOST=/var/run/postgresql' "PGPASSWORD=''"
else
  exit 95
fi
SH
cat > /tmp/schema-tools/psql <<'SH'
#!/bin/sh
set -eu
readonly_state="$(/usr/bin/psql -X -Atq -d "$DATABASE_URL" -c 'SHOW transaction_read_only;')"
[ "$readonly_state" = "\${EXPECTED_SCHEMA_READONLY:-on}" ] || exit 96
printf '%s\\n' "$readonly_state" >> /tmp/schema-sessions.log
exec /usr/bin/psql "$@"
SH
chmod 0555 /tmp/schema-tools/*
chmod -R a+rX /schema-scripts /migrations
`;
  ok(run('docker', ['exec', '-i', fixture, 'sh'], setup), 'read-only session recorder');
  const manifest = createHash('sha256').update(pack.migrations.slice(0, 22).map(m => m.sql).join('')).digest('hex');
  const migrationEnvironment = (name, mode = 'verify', extra = {}) => {
    const source = readFileSync(root + '/scripts/deployment/run-' + name + '.sh', 'utf8');
    return {
      PATH: '/tmp/schema-tools:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      DEPLOYMENT_ENVIRONMENT: 'preview', GOOGLE_CLOUD_PROJECT: 'khedmah-preview-v2-20261012',
      GOOGLE_CLOUD_REGION: 'europe-west1', PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl',
      MIGRATION_MODE: mode, ALLOW_LOCAL_SCHEMA_TESTS: 'true',
      DATABASE_URL: 'postgresql:///khedmah?user=khedmah_migrator',
      // The entrypoint must replace this unsafe inherited setting.
      PGOPTIONS: '-c default_transaction_read_only=off', FOUNDATION_MANIFEST_SHA256: manifest,
      MIGRATION_SHA256: source.match(/APPROVED_SHA256='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_036_SHA256: source.match(/APPROVED_036_SHA256='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_GIT_BLOB: source.match(/APPROVED_GIT_BLOB='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_033_SHA256: source.match(/APPROVED_033_SHA256='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_033_GIT_BLOB: source.match(/APPROVED_033_GIT_BLOB='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_035_SHA256: source.match(/APPROVED_035_SHA256='([a-f0-9]+)'/)?.[1] ?? '',
      MIGRATION_037_SHA256: source.match(/APPROVED_037_SHA256='([a-f0-9]+)'/)?.[1] ?? '',
      ...extra,
    };
  };
  const runMigration = (name, mode = 'verify', extra = {}) => {
    const env = migrationEnvironment(name, mode, extra);
    return run('docker', ['exec', ...Object.entries(env).flatMap(([k,v]) => ['--env', k + '=' + v]),
      fixture, 'sh', '/schema-scripts/run-' + name + '.sh']);
  };
  const approvalStage = 'approval-prerequisites-035-037-nonproduction-migration';
  const beforeApproval = snapshot();
  const applied = ok(runMigration(approvalStage, 'apply', {
    DEPLOYMENT_ENVIRONMENT: 'staging',
    GOOGLE_CLOUD_PROJECT: 'khedmah-staging-fixture',
    MIGRATION_CONFIRMATION: 'APPLY_KHEDMAH_NONPROD_035_037_STAGING',
    EXPECTED_SCHEMA_READONLY: 'off',
  }), 'real approval prerequisite apply');
  assert.ok(applied.some(line => line.includes('MIGRATIONS_035_037_APPLIED_AND_VERIFIED')));
  assert.notEqual(snapshot(), beforeApproval, 'The real apply path must install both governed successors.');
  const appliedSnapshot = snapshot();
  const approvalReplay = ok(runMigration(approvalStage, 'apply', {
    DEPLOYMENT_ENVIRONMENT: 'staging',
    GOOGLE_CLOUD_PROJECT: 'khedmah-staging-fixture',
    MIGRATION_CONFIRMATION: 'APPLY_KHEDMAH_NONPROD_035_037_STAGING',
    EXPECTED_SCHEMA_READONLY: 'off',
  }), 'idempotent approval prerequisite replay');
  assert.ok(approvalReplay.some(line => line.includes('MIGRATIONS_035_037_ALREADY_APPLIED_AND_VERIFIED')));
  assert.equal(snapshot(), appliedSnapshot);
  await t.test('quota catalog agrees with the complete canonical approval target', () => {
    const target = inspectQuota('complete approval target quota diagnosis', {}, true);
    assert.equal(target.classification, 'target');
    assertInspectionAgreement(target, 'complete canonical approval reader');
    assert.equal(snapshot(), appliedSnapshot, 'Inspection must not alter the verified approval target.');
  });

  const verifyRejectsConstraintDrift = (ddl, label) => {
    ok(sql(ddl, 'khedmah_migrator', 'khedmah', false), label + ' fixture');
    const drifted = snapshot();
    const rejected = runMigration(approvalStage);
    assert.notEqual(rejected.status, 0, label + ' must fail exact-state verification');
    assert.match(rejected.stderr, /PARTIAL_OR_UNVERIFIED_STATE|REQUIRE_CANONICAL_034_036/);
    assert.equal(snapshot(), drifted, label + ' verification must not repair drift');
  };
  const restore035 = () => ok(sql('SET search_path=public,pg_catalog;\n' +
    readFileSync(root + '/backend/migrations/versions/035_specialized_admin_roles.sql', 'utf8'),
    'khedmah_migrator', 'khedmah', false), 'restore canonical migration 035');
  const restore037 = () => ok(sql('SET search_path=public,pg_catalog;\n' +
    readFileSync(root + '/backend/migrations/versions/037_verification_evidence_media.sql', 'utf8'),
    'khedmah_migrator', 'khedmah', false), 'restore canonical migration 037');

  verifyRejectsConstraintDrift(`ALTER TABLE public.admin_roles
    DROP CONSTRAINT admin_roles_role_check,
    ADD CONSTRAINT admin_roles_role_check CHECK (role NOT IN
      ('bootstrap_admin','platform_admin','moderator','billing_admin','taxi_pricing_admin','category_admin'));`,
    'inverted specialized-role constraint');
  restore035();
  verifyRejectsConstraintDrift(`ALTER TABLE public.media_assets
    DROP CONSTRAINT media_assets_asset_type_check,
    ADD CONSTRAINT media_assets_asset_type_check CHECK (
      asset_type IN ('logo','cover','gallery','profile_image','service_image','product_image','ad_image',
        'driver_photo','identity_card','driving_license','vehicle_license',
        'business_verification_evidence','professional_verification_evidence') OR asset_type IS NOT NULL);`,
    'widened evidence asset constraint');
  restore037();
  verifyRejectsConstraintDrift(`ALTER TABLE public.media_assets
    DROP CONSTRAINT media_assets_verification_evidence_private_check,
    ADD CONSTRAINT media_assets_verification_evidence_private_check CHECK (
      ((asset_type IS NULL OR asset_type='business_verification_evidence')
        AND owner_type='business_profile' AND visibility='private')
      OR (asset_type='professional_verification_evidence'
        AND owner_type='professional_profile' AND visibility='private')
      OR asset_type NOT IN ('business_verification_evidence','professional_verification_evidence'));`,
    'same-token regrouped evidence privacy constraint');
  restore037();
  assert.equal(runMigration(approvalStage).status, 0, 'restored exact constraints must verify');

  ok(sql('ALTER TABLE public.ad_free_slots DISABLE TRIGGER ad_free_slot_limit_before_insert;',
    'khedmah_migrator', 'khedmah', false), 'disable rolling-quota trigger');
  const disabledQuotaSnapshot = snapshot();
  inspectQuota('disabled quota trigger diagnosis', { trigger_failed_checks: ['enabled'] });
  const disabledQuota = runMigration(approvalStage);
  assert.notEqual(disabledQuota.status, 0, 'disabled rolling-quota trigger must fail verification');
  assert.match(disabledQuota.stderr, /MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036/);
  assert.equal(snapshot(), disabledQuotaSnapshot, 'verification must not enable a disabled trigger');
  ok(sql('ALTER TABLE public.ad_free_slots ENABLE TRIGGER ad_free_slot_limit_before_insert;',
    'khedmah_migrator', 'khedmah', false), 'restore rolling-quota trigger');

  const quotaDefinitionResult = sql(
    "SELECT pg_get_functiondef('public.enforce_ad_free_slot_limit()'::regprocedure);");
  assert.equal(quotaDefinitionResult.status, 0, quotaDefinitionResult.stderr);
  const quotaDefinition = quotaDefinitionResult.stdout.trim();
  const driftedQuotaDefinition = quotaDefinition.replace("interval '24 hours'", "interval '23 hours'");
  assert.notEqual(driftedQuotaDefinition, quotaDefinition, 'quota body fixture must change the function');
  ok(sql(driftedQuotaDefinition, 'khedmah_migrator', 'khedmah', false), 'drift rolling-quota body');
  const quotaBodySnapshot = snapshot();
  inspectQuota('unknown quota body diagnosis', { body_036_exact: false });
  const quotaBodyRejected = runMigration(approvalStage);
  assert.notEqual(quotaBodyRejected.status, 0, 'rolling-quota body drift must fail verification');
  assert.match(quotaBodyRejected.stderr, /MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036/);
  assert.equal(snapshot(), quotaBodySnapshot, 'verification must not rewrite a drifted quota function');
  ok(sql(quotaDefinition, 'khedmah_migrator', 'khedmah', false), 'restore rolling-quota body');

  await t.test('quota catalog distinguishes missing objects and function security metadata drift', () => {
    const cases = [
      {
        label: 'missing exact quota signature',
        drift: 'ALTER FUNCTION public.enforce_ad_free_slot_limit() RENAME TO fixture_missing_quota;',
        restore: 'ALTER FUNCTION public.fixture_missing_quota() RENAME TO enforce_ad_free_slot_limit;',
        expected: { routine_count: 0, body_025_exact: null, body_036_exact: null,
          routine_failed_checks: ['missing'], trigger_failed_checks: ['function'] },
      },
      {
        label: 'missing named quota trigger',
        drift: 'ALTER TRIGGER ad_free_slot_limit_before_insert ON public.ad_free_slots RENAME TO fixture_missing_quota_trigger;',
        restore: 'ALTER TRIGGER fixture_missing_quota_trigger ON public.ad_free_slots RENAME TO ad_free_slot_limit_before_insert;',
        expected: { named_trigger_count: 0, trigger_failed_checks: ['missing'] },
      },
      {
        label: 'quota SECURITY DEFINER drift',
        drift: 'ALTER FUNCTION public.enforce_ad_free_slot_limit() SECURITY DEFINER;',
        restore: 'ALTER FUNCTION public.enforce_ad_free_slot_limit() SECURITY INVOKER;',
        expected: { routine_failed_checks: ['security_definer'] },
      },
      {
        label: 'quota function settings drift',
        drift: 'ALTER FUNCTION public.enforce_ad_free_slot_limit() SET search_path TO public,pg_catalog;',
        restore: 'ALTER FUNCTION public.enforce_ad_free_slot_limit() RESET ALL;',
        expected: { routine_failed_checks: ['settings'] },
      },
    ];
    for (const { label, drift, restore, expected } of cases) {
      ok(sql(drift, 'khedmah_migrator', 'khedmah', false), label + ' fixture');
      const before = snapshot();
      try {
        const diagnosed = inspectQuota(label, expected);
        assert.equal(diagnosed.classification, 'prerequisite-invalid');
        assert.equal(snapshot(), before, label + ': inspection must not repair the mismatch');
      } finally {
        ok(sql(restore, 'khedmah_migrator', 'khedmah', false), 'restore ' + label);
      }
    }
    const restored = snapshot();
    inspectQuota('quota metadata restored', {}, true);
    assert.equal(snapshot(), restored);
  });

  ok(sql('ALTER FUNCTION public.enforce_ad_free_slot_limit() OWNER TO postgres;',
    'postgres', 'khedmah', false), 'drift rolling-quota owner');
  const quotaOwnerSnapshot = snapshot();
  inspectQuota('quota owner drift diagnosis', { routine_failed_checks: ['owner'] });
  const quotaOwnerRejected = runMigration(approvalStage);
  assert.notEqual(quotaOwnerRejected.status, 0, 'rolling-quota owner drift must fail verification');
  assert.match(quotaOwnerRejected.stderr, /MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036/);
  assert.equal(snapshot(), quotaOwnerSnapshot, 'verification must not repair function ownership');
  ok(sql('ALTER FUNCTION public.enforce_ad_free_slot_limit() OWNER TO khedmah_migrator;',
    'postgres', 'khedmah', false), 'restore rolling-quota owner');

  ok(sql(`DROP TRIGGER ad_free_slot_limit_before_insert ON public.ad_free_slots;
    CREATE TRIGGER ad_free_slot_limit_before_insert BEFORE INSERT ON public.ad_free_slots
    FOR EACH ROW EXECUTE FUNCTION public.protect_ad_listing_identity();`,
    'khedmah_migrator', 'khedmah', false), 'drift rolling-quota trigger binding');
  const quotaBindingSnapshot = snapshot();
  inspectQuota('quota trigger binding diagnosis', { trigger_failed_checks: ['function'] });
  const quotaBindingRejected = runMigration(approvalStage);
  assert.notEqual(quotaBindingRejected.status, 0, 'rolling-quota trigger binding drift must fail verification');
  assert.match(quotaBindingRejected.stderr, /MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036/);
  assert.equal(snapshot(), quotaBindingSnapshot, 'verification must not rebind the quota trigger');
  ok(sql(`DROP TRIGGER ad_free_slot_limit_before_insert ON public.ad_free_slots;
    CREATE TRIGGER ad_free_slot_limit_before_insert BEFORE INSERT ON public.ad_free_slots
    FOR EACH ROW EXECUTE FUNCTION public.enforce_ad_free_slot_limit();`,
    'khedmah_migrator', 'khedmah', false), 'restore rolling-quota trigger binding');

  ok(sql(`CREATE TRIGGER fixture_extra_ad_free_slot_insert BEFORE INSERT ON public.ad_free_slots
    FOR EACH ROW EXECUTE FUNCTION public.enforce_ad_free_slot_limit();`,
    'khedmah_migrator', 'khedmah', false), 'add extra rolling-quota insert trigger');
  const extraInsertTriggerSnapshot = snapshot();
  inspectQuota('additional quota insert trigger diagnosis', { user_insert_trigger_count: 2 });
  const extraInsertTriggerRejected = runMigration(approvalStage);
  assert.notEqual(extraInsertTriggerRejected.status, 0, 'extra insert trigger must fail verification');
  assert.match(extraInsertTriggerRejected.stderr, /MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036/);
  assert.equal(snapshot(), extraInsertTriggerSnapshot, 'verification must not remove an extra insert trigger');
  ok(sql('DROP TRIGGER fixture_extra_ad_free_slot_insert ON public.ad_free_slots;',
    'khedmah_migrator', 'khedmah', false), 'remove extra rolling-quota insert trigger');

  ok(sql(`CREATE RULE fixture_ad_free_slot_insert AS ON INSERT TO public.ad_free_slots
    DO INSTEAD NOTHING;`, 'khedmah_migrator', 'khedmah', false), 'add rolling-quota insert rewrite rule');
  const insertRuleSnapshot = snapshot();
  const insertRuleMetadata = () => ok(sql(`SELECT to_jsonb(r) FROM pg_catalog.pg_rewrite r
    WHERE r.ev_class='public.ad_free_slots'::regclass AND r.rulename='fixture_ad_free_slot_insert';`),
    'quota insert rule metadata');
  const ruleBeforeInspection = insertRuleMetadata();
  assert.equal(ruleBeforeInspection.length, 1, 'The rule-preservation snapshot must contain the fixture rule.');
  inspectQuota('quota insert rule diagnosis', { insert_rule_count: 1 });
  const insertRuleRejected = runMigration(approvalStage);
  assert.notEqual(insertRuleRejected.status, 0, 'insert rewrite rule must fail verification');
  assert.match(insertRuleRejected.stderr, /MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036/);
  assert.equal(snapshot(), insertRuleSnapshot, 'verification must not remove an insert rewrite rule');
  assert.deepEqual(insertRuleMetadata(), ruleBeforeInspection, 'Inspection must preserve the exact insert rule.');
  ok(sql('DROP RULE fixture_ad_free_slot_insert ON public.ad_free_slots;',
    'khedmah_migrator', 'khedmah', false), 'remove rolling-quota insert rewrite rule');
  assert.equal(runMigration(approvalStage).status, 0, 'restored quota function and trigger must verify');

  const verifyRejectsColumnDrift = (ddl, restore, label, expected) => {
    ok(sql(ddl, 'khedmah_migrator', 'khedmah', false), label + ' fixture');
    const drifted = snapshot();
    const rejected = runMigration(approvalStage);
    assert.notEqual(rejected.status, 0, label + ' must fail exact-state verification');
    assert.match(rejected.stderr, expected);
    assert.equal(snapshot(), drifted, label + ' verification must not repair drift');
    ok(sql(restore, 'khedmah_migrator', 'khedmah', false), 'restore ' + label);
    assert.equal(runMigration(approvalStage).status, 0, 'restored ' + label + ' must verify');
  };
  verifyRejectsColumnDrift(`ALTER TABLE public.ad_free_slots
      ALTER COLUMN consumed_at DROP NOT NULL,
      ALTER COLUMN consumed_at DROP DEFAULT;`, `ALTER TABLE public.ad_free_slots
      ALTER COLUMN consumed_at SET DEFAULT NOW(),
      ALTER COLUMN consumed_at SET NOT NULL;`, 'rolling-quota timestamp invariants',
    /MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036/);
  verifyRejectsColumnDrift(`ALTER TABLE public.ad_free_slots
      ALTER COLUMN owner_user_id DROP NOT NULL,
      ALTER COLUMN owner_user_id SET DEFAULT 'fixture-owner';`, `ALTER TABLE public.ad_free_slots
      ALTER COLUMN owner_user_id DROP DEFAULT,
      ALTER COLUMN owner_user_id SET NOT NULL;`,
    'rolling-quota owner invariant', /MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036/);
  verifyRejectsColumnDrift(`ALTER TABLE public.admin_roles
      ALTER COLUMN role DROP NOT NULL,
      ALTER COLUMN role SET DEFAULT 'moderator';`, `ALTER TABLE public.admin_roles
      ALTER COLUMN role DROP DEFAULT,
      ALTER COLUMN role SET NOT NULL;`,
    'administrator role invariant', /MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE/);
  verifyRejectsColumnDrift('ALTER TABLE public.admin_roles ALTER COLUMN role TYPE text COLLATE "C";',
    'ALTER TABLE public.admin_roles ALTER COLUMN role TYPE text COLLATE "default";',
    'administrator role collation invariant', /MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE/);
  verifyRejectsColumnDrift(`ALTER TABLE public.media_assets
      ALTER COLUMN asset_type SET NOT NULL,
      ALTER COLUMN asset_type SET DEFAULT 'logo';`, `ALTER TABLE public.media_assets
      ALTER COLUMN asset_type DROP DEFAULT,
      ALTER COLUMN asset_type DROP NOT NULL;`,
    'evidence asset type invariant', /MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE/);
  verifyRejectsColumnDrift(`ALTER TABLE public.media_assets
      ALTER COLUMN visibility DROP NOT NULL,
      ALTER COLUMN visibility DROP DEFAULT;`, `ALTER TABLE public.media_assets
      ALTER COLUMN visibility SET DEFAULT 'private'::text,
      ALTER COLUMN visibility SET NOT NULL;`,
    'evidence visibility invariant', /MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE/);
  verifyRejectsColumnDrift(`ALTER TABLE public.media_assets
      ALTER COLUMN owner_type DROP NOT NULL,
      ALTER COLUMN owner_type SET DEFAULT 'business_profile';`, `ALTER TABLE public.media_assets
      ALTER COLUMN owner_type DROP DEFAULT,
      ALTER COLUMN owner_type SET NOT NULL;`,
    'evidence owner invariant', /MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE/);

  // A stable predecessor/target inversion is invalid and must not be repaired.
  ok(sql(`ALTER TABLE public.admin_roles
    DROP CONSTRAINT admin_roles_role_check,
    ADD CONSTRAINT admin_roles_role_check CHECK (role IN
      ('bootstrap_admin','platform_admin','moderator','billing_admin'));`,
    'khedmah_migrator', 'khedmah', false), 'create inverted successor state');
  const invertedSuccessor = snapshot();
  const invertedRejected = runMigration(approvalStage);
  assert.notEqual(invertedRejected.status, 0);
  assert.match(invertedRejected.stderr, /MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE/);
  assert.equal(snapshot(), invertedSuccessor, 'Invalid predecessor/target state must remain untouched.');
  restore035();
  assert.equal(runMigration(approvalStage).status, 0, 'restored successor state must verify');

  // Two apply runners may both classify the predecessor before either writes.
  // Advisory/table locks must make exactly one runner install each migration,
  // while both converge successfully instead of rejecting a transient mix.
  ok(sql(`ALTER TABLE public.media_assets
      DROP CONSTRAINT media_assets_verification_evidence_private_check,
      DROP CONSTRAINT media_assets_asset_type_check,
      ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN
        ('logo','cover','gallery','profile_image','service_image','product_image','ad_image',
         'driver_photo','identity_card','driving_license','vehicle_license'));
    ALTER TABLE public.admin_roles
      DROP CONSTRAINT admin_roles_role_check,
      ADD CONSTRAINT admin_roles_role_check CHECK (role IN
        ('bootstrap_admin','platform_admin','moderator','billing_admin'));`,
    'khedmah_migrator', 'khedmah', false), 'reset both approval prerequisite migrations');
  const beforeConcurrentApply = snapshot();
  const concurrentEnv = migrationEnvironment(approvalStage, 'apply', {
    DEPLOYMENT_ENVIRONMENT: 'staging',
    GOOGLE_CLOUD_PROJECT: 'khedmah-staging-fixture',
    MIGRATION_CONFIRMATION: 'APPLY_KHEDMAH_NONPROD_035_037_STAGING',
    EXPECTED_SCHEMA_READONLY: 'off',
  });
  const concurrentApply = run('docker', ['exec',
    ...Object.entries(concurrentEnv).flatMap(([k,v]) => ['--env', k + '=' + v]), fixture, 'sh', '-c', `
set +e
sh /schema-scripts/run-${approvalStage}.sh > /tmp/approval-a.out 2> /tmp/approval-a.err & a=$!
sh /schema-scripts/run-${approvalStage}.sh > /tmp/approval-b.out 2> /tmp/approval-b.err & b=$!
wait "$a"; sa=$?
wait "$b"; sb=$?
printf 'A_STATUS=%s B_STATUS=%s\\n' "$sa" "$sb"
cat /tmp/approval-a.out /tmp/approval-b.out
cat /tmp/approval-a.err /tmp/approval-b.err >&2
[ "$sa" -eq 0 ] && [ "$sb" -eq 0 ]
`]);
  assert.equal(concurrentApply.status, 0, concurrentApply.stderr || concurrentApply.stdout);
  assert.match(concurrentApply.stdout, /A_STATUS=0 B_STATUS=0/);
  assert.equal((concurrentApply.stdout.match(/MIGRATION_035_APPLIED_AFTER_LOCK/g) ?? []).length, 1);
  assert.equal((concurrentApply.stdout.match(/MIGRATION_037_APPLIED_AFTER_LOCK/g) ?? []).length, 1);
  assert.notEqual(snapshot(), beforeConcurrentApply, 'Concurrent apply must install both successors.');
  assert.equal(runMigration(approvalStage).status, 0, 'Concurrent result must verify exactly.');

  // Prove the supported resume point: 035 is retained while 037 is reset to
  // its exact Migration 027 predecessor, then the governed runner applies 037.
  ok(sql(`ALTER TABLE public.media_assets
    DROP CONSTRAINT media_assets_verification_evidence_private_check,
    DROP CONSTRAINT media_assets_asset_type_check,
    ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN
      ('logo','cover','gallery','profile_image','service_image','product_image','ad_image',
       'driver_photo','identity_card','driving_license','vehicle_license'));`,
    'khedmah_migrator', 'khedmah', false), 'reset only migration 037');
  const reset037Snapshot = snapshot();
  const resumed = ok(runMigration(approvalStage, 'apply', {
    DEPLOYMENT_ENVIRONMENT: 'staging',
    GOOGLE_CLOUD_PROJECT: 'khedmah-staging-fixture',
    MIGRATION_CONFIRMATION: 'APPLY_KHEDMAH_NONPROD_035_037_STAGING',
    EXPECTED_SCHEMA_READONLY: 'off',
  }), 'resume after migration 035');
  assert.ok(resumed.some(line => line.includes('MIGRATIONS_035_037_APPLIED_AND_VERIFIED')));
  assert.notEqual(snapshot(), reset037Snapshot, 'Resume must replace the predecessor constraints.');
  assert.equal(runMigration(approvalStage).status, 0, 'Resumed canonical constraints must verify read-only.');

  ok(docker('exec', fixture, 'sh', '-c', ': > /tmp/schema-sessions.log'), 'reset session evidence after apply');
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
    const finalVerifier = 'food-promotions-nonproduction-migration';
    const reject = () => assert.notEqual(runMigration(finalVerifier).status, 0);
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
    ok(runMigration(finalVerifier), 'final restored verification');
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
    assert.notEqual(runMigration('food-promotions-nonproduction-migration').status, 0);
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
