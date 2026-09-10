import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runner = read('scripts/deployment/run-classifieds-nonproduction-migration.sh');
const runnerPath = fileURLToPath(new URL('../scripts/deployment/run-classifieds-nonproduction-migration.sh', import.meta.url));
const migrationPath = fileURLToPath(new URL('../backend/migrations/versions/025_classifieds.sql', import.meta.url));
const migrationSha = '0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d';

test('Classifieds schema probe exposes stable read-only diagnostic exit codes', () => {
  const expected = new Map([
    ['missing_024', 41],
    ['not_applied', 42],
    ['partial_tables', 43],
    ['missing_indexes', 44],
    ['missing_triggers', 45],
    ['missing_functions', 46],
    ['missing_media', 47]
  ]);
  for (const [state, code] of expected) {
    assert.match(runner, new RegExp(`${state}\\) exit ${code}`));
  }
  assert.match(runner, /exit 48/);
  assert.match(runner, /return 49/);
  assert.match(runner, /exit 50/);
  assert.match(runner, /return 51/);
  assert.match(runner, /exit 52/);
});

test('connectivity is checked separately before schema catalog introspection', () => {
  const connectivity = runner.indexOf("-c 'SELECT 1'");
  const scalarProbe = runner.indexOf('psql_scalar()');
  const schemaProbe = runner.indexOf('schema_state()');
  assert.ok(connectivity > 0);
  assert.ok(scalarProbe > connectivity);
  assert.ok(schemaProbe > scalarProbe);
  assert.match(runner.slice(connectivity, scalarProbe), /exit 50/);
  assert.match(runner.slice(scalarProbe, schemaProbe), /return 49/);
});

test('verify mode cannot enter the migration apply transaction', () => {
  const verifyGate = runner.indexOf("if [ \"$mode\" = 'verify' ]; then");
  const applyGate = runner.indexOf("[ \"$state\" = 'not_applied' ] || exit_for_schema_state");
  const transaction = runner.indexOf('BEGIN;');
  assert.ok(verifyGate > 0);
  assert.ok(applyGate > verifyGate);
  assert.ok(transaction > applyGate);
  assert.match(runner.slice(verifyGate, applyGate), /exit_for_schema_state \"\$state\"/);
});

test('production refusal precedes connectivity, schema query and mutation paths', () => {
  const refusal = runner.indexOf('Refusing Classifieds migration 025 against the production project');
  const connectivity = runner.indexOf("-c 'SELECT 1'");
  const schemaProbe = runner.indexOf('schema_state()');
  const transaction = runner.indexOf('BEGIN;');
  assert.ok(refusal > 0);
  assert.ok(connectivity > refusal);
  assert.ok(schemaProbe > connectivity);
  assert.ok(transaction > schemaProbe);
});

test('schema state distinguishes unapplied and partial 025 footprints before apply', () => {
  for (const marker of ['missing_024','not_applied','partial_tables','missing_indexes','missing_triggers','missing_functions','missing_media','verified']) {
    assert.match(runner, new RegExp(marker));
  }
  assert.match(runner, /MIGRATION_025_PARTIAL_OR_UNVERIFIED_STATE/);
});

test('test migration file override remains checksum bound', () => {
  assert.match(runner, /CLASSIFIEDS_MIGRATION_FILE/);
  assert.match(runner, /APPROVED_SHA256/);
  const checksum = runner.indexOf('sha256sum -c -');
  const connectivity = runner.indexOf("-c 'SELECT 1'");
  assert.ok(checksum > 0);
  assert.ok(connectivity > checksum);
});

test('Cloud Run migration job receives its Cloud SQL connection identity and parser runtime', () => {
  const ensure = read('scripts/deployment/ensure-classifieds-nonproduction-schema.sh');
  const docker = read('Dockerfile.classifieds-migration');
  assert.match(ensure, /CLOUD_SQL_INSTANCE_CONNECTION_NAME=\$\{CLOUD_SQL_INSTANCE_CONNECTION_NAME\}/);
  assert.match(ensure, /--set-cloudsql-instances "\$CLOUD_SQL_INSTANCE_CONNECTION_NAME"/);
  assert.match(docker, /apk add --no-cache python3/);
});

test('Cloud SQL connection uses the attached Unix socket and decoded credentials without printing the password', () => {
  const temp = mkdtempSync(join(tmpdir(), 'khedmah-classifieds-socket-'));
  try {
    const fakePsql = join(temp, 'psql');
    const capture = join(temp, 'capture.txt');
    writeFileSync(fakePsql, `#!/bin/sh
password_match=no
[ "\${PGPASSWORD:-}" = "\${PROBE_EXPECTED_PASSWORD:-}" ] && password_match=yes
{
  printf 'PGHOST=%s\\n' "\${PGHOST:-}"
  printf 'PGUSER=%s\\n' "\${PGUSER:-}"
  printf 'PGDATABASE=%s\\n' "\${PGDATABASE:-}"
  printf 'PGSSLMODE=%s\\n' "\${PGSSLMODE:-}"
  printf 'PASSWORD_MATCH=%s\\n' "$password_match"
} > "\${PROBE_CAPTURE_FILE}"
case "$*" in
  *"SELECT 1"*) printf '1\\n'; exit 0 ;;
  *"product_listings"*"media_assets"*) printf '0\\n'; exit 0 ;;
  *) printf '0\\n'; exit 0 ;;
esac
`);
    chmodSync(fakePsql, 0o755);
    const result = spawnSync('sh', [runnerPath], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${temp}:${process.env.PATH ?? ''}`,
        DATABASE_URL: 'postgresql://probe%2Duser:p%40ss%3Aword@public.invalid:5432/probe%2Ddb?sslmode=require',
        DEPLOYMENT_ENVIRONMENT: 'preview',
        MIGRATION_MODE: 'verify',
        GOOGLE_CLOUD_PROJECT: 'khedmah-preview-safe',
        PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedmah-production-protected',
        CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'khedmah-preview-safe:europe-west1:preview-db',
        MIGRATION_SHA256: migrationSha,
        CLASSIFIEDS_MIGRATION_FILE: migrationPath,
        PROBE_CAPTURE_FILE: capture,
        PROBE_EXPECTED_PASSWORD: 'p@ss:word'
      },
      encoding: 'utf8'
    });
    assert.equal(result.status, 41, result.stderr || result.stdout);
    const observed = readFileSync(capture, 'utf8');
    assert.match(observed, /PGHOST=\/cloudsql\/khedmah-preview-safe:europe-west1:preview-db/);
    assert.match(observed, /PGUSER=probe-user/);
    assert.match(observed, /PGDATABASE=probe-db/);
    assert.match(observed, /PGSSLMODE=disable/);
    assert.match(observed, /PASSWORD_MATCH=yes/);
    assert.doesNotMatch(observed, /p@ss:word/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
