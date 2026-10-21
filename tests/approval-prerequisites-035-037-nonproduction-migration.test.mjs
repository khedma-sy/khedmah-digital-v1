import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration035, migration037, runner, ensure, dockerfile, cloudbuild, productionOperator] = await Promise.all([
  read('backend/migrations/versions/035_specialized_admin_roles.sql'),
  read('backend/migrations/versions/037_verification_evidence_media.sql'),
  read('scripts/deployment/run-approval-prerequisites-035-037-nonproduction-migration.sh'),
  read('scripts/deployment/ensure-approval-prerequisites-035-037-nonproduction-schema.sh'),
  read('Dockerfile.approval-prerequisites-migration'),
  read('cloudbuild.approval-prerequisites-migration.yaml'),
  read('.github/workflows/production-operator.yml'),
]);
const runnerPath = fileURLToPath(new URL('../scripts/deployment/run-approval-prerequisites-035-037-nonproduction-migration.sh', import.meta.url));
const ensurePath = fileURLToPath(new URL('../scripts/deployment/ensure-approval-prerequisites-035-037-nonproduction-schema.sh', import.meta.url));
const migration035Path = fileURLToPath(new URL('../backend/migrations/versions/035_specialized_admin_roles.sql', import.meta.url));
const migration037Path = fileURLToPath(new URL('../backend/migrations/versions/037_verification_evidence_media.sql', import.meta.url));

const identity = bytes => ({
  sha256: createHash('sha256').update(bytes).digest('hex'),
  gitBlob: createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'),
});

test('approval prerequisite stage pins both reviewed migration identities', () => {
  const m35 = identity(Buffer.from(migration035));
  const m37 = identity(Buffer.from(migration037));
  assert.deepEqual(m35, {
    sha256: 'e21bcbb1da547ca56aa290a1f89023e6c3692d5f1d27e99675e1d481021de693',
    gitBlob: '5fc48b6ad31e5f0033b277b650996dcacd2d554f',
  });
  assert.deepEqual(m37, {
    sha256: '2ff2dbac17a7606ced97cb332c52a431d6eb6ea6b35271906ff9984d14a7b216',
    gitBlob: '71f86e7c500adfdcd4ca3f2fe8a3562f66374874',
  });
  for (const value of [m35.sha256, m37.sha256]) {
    assert.match(runner, new RegExp(value));
    assert.match(ensure, new RegExp(value));
  }
  for (const value of [m35.gitBlob, m37.gitBlob]) assert.match(ensure, new RegExp(value));
  for (const name of ['035_specialized_admin_roles.sql', '037_verification_evidence_media.sql']) {
    assert.match(dockerfile, new RegExp(name.replace('.', '\\.')));
  }
  assert.match(cloudbuild, /Dockerfile\.approval-prerequisites-migration/);
  assert.match(migration037, /ALTER TABLE public\.media_assets/g);
  assert.doesNotMatch(migration037, /ALTER TABLE media_assets/);
});

test('runner is POSIX-valid, resume-safe and exact about canonical states', () => {
  const syntax = spawnSync('/bin/sh', ['-n', runnerPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || 'runner must parse as POSIX shell');
  for (const required of [
    'APPLY_KHEDMAH_NONPROD_035_037_',
    'MIGRATIONS_035_037_REQUIRE_CANONICAL_034_036',
    'MIGRATIONS_035_037_PARTIAL_OR_UNVERIFIED_STATE',
    'MIGRATIONS_035_037_ALREADY_APPLIED_AND_VERIFIED',
    'MIGRATIONS_035_037_APPLIED_AND_VERIFIED',
    'convalidated',
    'taxi_pricing_admin',
    'category_admin',
    'AD_DAILY_QUOTA_EXHAUSTED',
    'AD_WEEKLY_QUOTA_EXHAUSTED',
    'business_verification_evidence',
    'professional_verification_evidence',
    'pg_catalog.pg_advisory_xact_lock(',
    "pg_catalog.hashtextextended('khedmah-nonproduction-approval-prerequisites-035-037',0)",
    'SET LOCAL search_path=pg_catalog,public',
    'LOCK TABLE public.admin_roles IN ACCESS EXCLUSIVE MODE',
    'LOCK TABLE public.media_assets IN ACCESS EXCLUSIVE MODE',
    'LOCK TABLE public.admin_roles, public.ad_free_slots, public.media_assets IN ROW EXCLUSIVE MODE',
    'BEGIN READ ONLY',
    'locked_step()',
    'pg_catalog.pg_get_constraintdef(c.oid) AS definition',
    'CHECK ((role = ANY',
    'CHECK (((asset_type IS NULL)',
    "t.tgname='ad_free_slot_limit_before_insert'",
    't.tgconstraint=0',
    't.tgparentid=0',
    "attname='role'",
    "attname='owner_user_id'",
    "attname='consumed_at'",
    "default_definition='now()'",
    "attname='asset_type'",
    "attname='owner_type'",
    "attname='visibility'",
    "default_definition='''private''::text'",
    "attcollation='pg_catalog.\"default\"'::regcollation",
    'attcollation=0',
    '(t.tgtype::integer & 4)=4',
    "r.ev_type='3'",
  ]) assert.ok(runner.includes(required), `missing runner guard: ${required}`);
  const migration035Apply = runner.indexOf('\\ir :migration_035_file');
  const migration037Apply = runner.indexOf('\\ir :migration_037_file');
  assert.ok(migration035Apply >= 0 && migration037Apply > migration035Apply);
  assert.match(runner, /WHEN role_state\.predecessor AND asset_state\.predecessor AND private_state\.absent THEN 'predecessor'/);
  assert.match(runner, /WHEN role_state\.target AND asset_state\.target AND private_state\.target THEN 'target'/);
  assert.match(runner, /BEGIN READ ONLY;[\s\S]*LOCK TABLE public\.admin_roles, public\.ad_free_slots, public\.media_assets IN ROW EXCLUSIVE MODE/);
  assert.doesNotMatch(runner, /SHARE UPDATE EXCLUSIVE MODE/);
  assert.match(runner, /while \[ "\$step" -lt 4 \]; do[\s\S]*step_output="\$\(locked_step\)"/);
  assert.doesNotMatch(runner, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|printenv/i);
});

test('runner hardens Cloud SQL routing and isolates the local test escape hatch', () => {
  for (const required of [
    'ALLOW_LOCAL_SCHEMA_TESTS', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE',
    'expected_prefix="${project}:${region}:"', "psql -h \"$PGHOST\" -U \"$PGUSER\" -d \"$PGDATABASE\"",
    "re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', database)",
    "database != 'khedmah' or user != 'khedmah_migrator'",
    'MIGRATIONS_035_037_DATABASE_IDENTITY_MISMATCH',
  ]) assert.ok(runner.includes(required), `missing connection guard: ${required}`);

  const temp = mkdtempSync(join(tmpdir(), 'approval-prerequisite-routing-'));
  const marker = join(temp, 'psql-called');
  try {
    writeFileSync(join(temp, 'psql'), `#!/bin/sh\ntouch "${marker}"\nexit 99\n`, { mode: 0o755 });
    writeFileSync(join(temp, 'gcloud'), `#!/bin/sh\ntouch "${marker}"\nexit 99\n`, { mode: 0o755 });
    const result = spawnSync('/bin/sh', [runnerPath], { encoding: 'utf8', env: {
      ...process.env,
      PATH: `${temp}:${process.env.PATH}`,
      DEPLOYMENT_ENVIRONMENT: 'staging',
      GOOGLE_CLOUD_PROJECT: 'khedmah-staging-fixture',
      GOOGLE_CLOUD_REGION: 'europe-west1',
      PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl',
      CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'khedmah-staging-fixture:europe-west1:db',
      DATABASE_URL: 'postgresql://migrator:secret@ignored/khedmah%3Dhost%3Devil',
      MIGRATION_MODE: 'verify',
      MIGRATION_035_SHA256: 'e21bcbb1da547ca56aa290a1f89023e6c3692d5f1d27e99675e1d481021de693',
      MIGRATION_037_SHA256: '2ff2dbac17a7606ced97cb332c52a431d6eb6ea6b35271906ff9984d14a7b216',
      SPECIALIZED_ADMIN_MIGRATION_FILE: migration035Path,
      VERIFICATION_EVIDENCE_MIGRATION_FILE: migration037Path,
    } });
    assert.equal(result.status, 52, result.stderr);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('replacement Preview apply and Production stop before migration or database access', () => {
  const temp = mkdtempSync(join(tmpdir(), 'approval-prerequisite-refusal-'));
  const marker = join(temp, 'connected');
  try {
    writeFileSync(join(temp, 'psql'), `#!/bin/sh\ntouch "${marker}"\nexit 99\n`, { mode: 0o755 });
    writeFileSync(join(temp, 'gcloud'), `#!/bin/sh\ntouch "${marker}"\nexit 99\n`, { mode: 0o755 });
    const common = {
      ...process.env,
      PATH: `${temp}:${process.env.PATH}`,
      DATABASE_URL: 'postgresql://unused.invalid/example',
      MIGRATION_MODE: 'apply',
      MIGRATION_035_SHA256: 'e21bcbb1da547ca56aa290a1f89023e6c3692d5f1d27e99675e1d481021de693',
      MIGRATION_037_SHA256: '2ff2dbac17a7606ced97cb332c52a431d6eb6ea6b35271906ff9984d14a7b216',
    };
    const preview = spawnSync('/bin/sh', [runnerPath], { encoding: 'utf8', env: {
      ...common,
      DEPLOYMENT_ENVIRONMENT: 'preview',
      GOOGLE_CLOUD_PROJECT: 'khedmah-preview-v2-20261012',
      PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl',
    } });
    assert.equal(preview.status, 4, preview.stderr);
    assert.match(preview.stderr, /PREVIEW_V2_SCHEMA_VERIFY_ONLY/);

    const production = spawnSync('/bin/sh', [runnerPath], { encoding: 'utf8', env: {
      ...common,
      DEPLOYMENT_ENVIRONMENT: 'staging',
      GOOGLE_CLOUD_PROJECT: 'khedma-dl',
      PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl',
    } });
    assert.equal(production.status, 65, production.stderr);
    assert.match(production.stderr, /Refusing approval prerequisite migrations 035 and 037/);

    const falsifiedProductionVariable = spawnSync('/bin/sh', [runnerPath], { encoding: 'utf8', env: {
      ...common,
      DEPLOYMENT_ENVIRONMENT: 'staging',
      GOOGLE_CLOUD_PROJECT: 'khedma-dl',
      PRODUCTION_GOOGLE_CLOUD_PROJECT: 'wrong-project',
    } });
    assert.equal(falsifiedProductionVariable.status, 65, falsifiedProductionVariable.stderr);
    assert.match(falsifiedProductionVariable.stderr, /Canonical production project identity/);

    const ensureWithFalsifiedProduction = spawnSync('/bin/bash', [ensurePath, 'staging', 'fixture'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${temp}:${process.env.PATH}`,
        APPROVAL_PREREQUISITES_MIGRATIONS_035_037_MODE: 'off',
        GOOGLE_CLOUD_PROJECT: 'khedma-dl',
        GOOGLE_CLOUD_REGION: 'europe-west1',
        ARTIFACT_REPOSITORY: 'fixture',
        RUNTIME_SERVICE_ACCOUNT: 'fixture@example.invalid',
        CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'khedma-dl:europe-west1:fixture',
        PRODUCTION_GOOGLE_CLOUD_PROJECT: 'wrong-project',
      },
    });
    assert.equal(ensureWithFalsifiedProduction.status, 4, ensureWithFalsifiedProduction.stderr);
    assert.match(ensureWithFalsifiedProduction.stderr, /Canonical production project identity/);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('ensure helper is bounded and the Production operator cannot expose the stage', () => {
  for (const required of [
    'approval-prerequisites-035-037',
    'APPROVAL_PREREQUISITES_MIGRATIONS_035_037_MODE',
    'APPLY_KHEDMAH_NONPROD_035_037_',
    'APPROVAL_PREREQUISITES_035_037_FAILED_EXECUTION',
    'APPROVAL_PREREQUISITES_035_037_CONTAINER_LOGS_BEGIN',
    '--max-retries 0',
    'DATABASE_URL=DATABASE_MIGRATION_URL:',
    'STAGING_MIGRATION_SERVICE_ACCOUNT',
    'STAGING_DATABASE_MIGRATION_SECRET_VERSION',
  ]) assert.ok(ensure.includes(required), `missing ensure boundary: ${required}`);
  assert.doesNotMatch(productionOperator, /approval-prerequisites|APPLY_MIGRATION_035|APPLY_MIGRATION_037/);
});
