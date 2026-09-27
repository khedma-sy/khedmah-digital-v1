import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const repositoryRoot = resolve(import.meta.dirname, '..');

const productionDatabaseScripts = [
  'scripts/production-database-role-bootstrap.sh',
  'scripts/run-production-baseline-001-020.sh',
  'scripts/run-production-migration.sh',
  'scripts/run-production-migrations-025-034.sh',
];
const productionMigrationScripts = productionDatabaseScripts.slice(1);

const productionJobWorkflows = [
  '.github/workflows/production-database-role-bootstrap.yml',
  '.github/workflows/production-baseline-001-020.yml',
  '.github/workflows/production-migrations-025-034.yml',
  '.github/workflows/production-operator.yml',
  '.github/workflows/production-operator-new-account.yml',
];

test('every production database image replaces localhost with its attached Cloud SQL socket', async () => {
  for (const path of productionDatabaseScripts) {
    const source = await read(path);
    assert.match(source, /CLOUD_SQL_INSTANCE_CONNECTION_NAME is required for Production database operations/, path);
    assert.match(source, /PSQL_DATABASE_URL="\$DATABASE_URL"/, path);
    assert.match(source, /DATABASE_CREDENTIALS="\$\{DATABASE_URI_REST%%@localhost\/\*\}"/, path);
    assert.match(source, /DATABASE_NAME_FROM_URL="\$\{DATABASE_URI_REST#{1,2}\*@localhost\/\}"/, path);
    assert.match(
      source,
      /case "\$DATABASE_PASSWORD_FROM_URL" in|is_managed_hex_password "\$DATABASE_PASSWORD_FROM_URL"/,
      path,
    );
    assert.match(source, /PSQL_DATABASE_URL="\$\{DATABASE_URI_SCHEME\}:\/\/\$\{DATABASE_CREDENTIALS\}@\/\$\{DATABASE_NAME_FROM_URL\}"/, path);
    assert.match(source, /PGHOST="\/cloudsql\/\$CLOUD_SQL_INSTANCE_CONNECTION_NAME"/, path);
    assert.match(source, /PGPORT=5432/, path);
    assert.match(source, /PGSSLMODE=disable/, path);
    assert.match(source, /unset PGHOSTADDR PGSERVICE PGSERVICEFILE/, path);
    if (!path.endsWith('production-database-role-bootstrap.sh')) {
      assert.match(source, /PGOPTIONS='-c role=none -c search_path=public'/, path);
      assert.match(source, /export PGOPTIONS/, path);
    }
    assert.match(source, /Cloud SQL DATABASE_URL must use the approved localhost authority/, path);
    assert.match(source, /current_user = '\$DATABASE_MIGRATION_USER'|current_user = '\$MIGRATION_USER'/, path);
    assert.match(source, /current_database\(\) = '\$DATABASE_NAME'/, path);
    assert.match(source, /psql "\$PSQL_DATABASE_URL"/, path);
    assert.doesNotMatch(source, /psql "\$DATABASE_URL"/, path);
  }
});

test('production migration runners validate complete scalars without line-oriented grep', async () => {
  for (const path of productionMigrationScripts) {
    const source = await read(path);
    assert.doesNotMatch(source, /grep -Eq/, path);
    assert.match(source, /case "\$CLOUD_SQL_INSTANCE_CONNECTION_NAME" in/, path);
    assert.match(source, /case "\$DATABASE_MIGRATION_USER" in/, path);
    assert.match(source, /case "\$DATABASE_NAME" in/, path);
    assert.match(source, /case "\$DATABASE_PASSWORD_FROM_URL" in/, path);
    assert.match(source, /test "\$\{#DATABASE_PASSWORD_FROM_URL\}" -eq 64/, path);
  }
});

test('every production Cloud Run database job passes its attached instance name into the image', async () => {
  for (const path of productionJobWorkflows) {
    const source = await read(path);
    const jobBlocks = source.split('--set-cloudsql-instances').slice(1);
    assert.ok(jobBlocks.length > 0, `${path}: expected at least one Cloud SQL job`);
    for (const block of jobBlocks) {
      const deploymentArguments = block.split('--tasks')[0];
      assert.match(
        deploymentArguments,
        /--set-env-vars[^\n]*CLOUD_SQL_INSTANCE_CONNECTION_NAME=/,
        `${path}: attached instance was not passed to the database image`,
      );
      assert.match(deploymentArguments, /DATABASE_MIGRATION_USER=/, `${path}: expected migration identity was not passed`);
      assert.match(deploymentArguments, /DATABASE_RUNTIME_USER=/, `${path}: expected runtime identity was not passed`);
      assert.match(deploymentArguments, /DATABASE_RUNTIME_ROLE=/, `${path}: expected runtime privilege role was not passed`);
      assert.match(deploymentArguments, /DATABASE_MIGRATION_ROLE=/, `${path}: expected migration privilege role was not passed`);
      assert.match(deploymentArguments, /DATABASE_NAME=/, `${path}: expected database name was not passed`);
    }
  }
});

test('every production schema mutation runner fail-closes on exact PostgreSQL 16 role isolation before and inside the lock', async () => {
  for (const path of productionMigrationScripts) {
    const source = await read(path);
    const predicateIndex = source.indexOf('DATABASE_ROLE_ISOLATION_SAFE_SQL="');
    const initialGateIndex = source.indexOf('database_role_isolation_state="$(psql', predicateIndex);
    const firstLockIndex = source.indexOf("hashtextextended('khedmah-production-schema-change', 0)", initialGateIndex);
    assert.ok(
      predicateIndex >= 0 && initialGateIndex > predicateIndex && firstLockIndex > initialGateIndex,
      `${path}: the role-isolation gate must execute before acquiring the schema lock`,
    );

    for (const required of [
      "current_setting('server_version_num')::integer >= 160000",
      "role.rolname='$DATABASE_RUNTIME_USER'",
      "role.rolname='$DATABASE_MIGRATION_USER'",
      "role.rolname IN ('$DATABASE_RUNTIME_ROLE','$DATABASE_MIGRATION_ROLE')",
      'role.rolcanlogin AND role.rolinherit',
      'NOT role.rolcanlogin AND role.rolinherit',
      'NOT role.rolsuper AND NOT role.rolcreatedb AND NOT role.rolcreaterole',
      'NOT role.rolreplication AND NOT role.rolbypassrls',
      "NOT pg_catalog.pg_has_role('$DATABASE_RUNTIME_USER','cloudsqlsuperuser','member')",
      "NOT pg_catalog.pg_has_role('$DATABASE_MIGRATION_USER','cloudsqlsuperuser','member')",
      "member_role.rolname='$DATABASE_RUNTIME_USER'",
      "granted_role.rolname='$DATABASE_RUNTIME_ROLE'",
      "member_role.rolname='$DATABASE_MIGRATION_USER'",
      "granted_role.rolname='$DATABASE_MIGRATION_ROLE'",
      'NOT membership.admin_option',
      'membership.inherit_option',
      'membership.set_option',
    ]) assert.ok(source.includes(required), `${path}: missing role-isolation clause: ${required}`);

    const locks = [...source.matchAll(/SELECT pg_advisory_(?:xact_)?lock\(hashtextextended\('khedmah-production-schema-change', 0\)\);/g)];
    assert.ok(locks.length > 0, `${path}: no schema lock found`);
    for (const lock of locks) {
      const afterLock = source.slice(lock.index, source.indexOf('\\ir ', lock.index));
      assert.match(afterLock, /IF NOT \(\s*\$DATABASE_ROLE_ISOLATION_SAFE_SQL\s*\) THEN/,
        `${path}: role isolation must be rechecked after each schema lock`);
      assert.match(afterLock, /RAISE EXCEPTION 'PRODUCTION_DATABASE_ROLE_ISOLATION_NOT_READY'/, path);
    }
  }
});

test('all production database mutations share one workflow and PostgreSQL lock domain', async () => {
  for (const path of productionJobWorkflows) {
    const source = await read(path);
    assert.match(source, /concurrency:\n  group: production-database-change\n  cancel-in-progress: false/, path);
  }

  for (const path of productionDatabaseScripts) {
    const source = await read(path);
    assert.match(source, /khedmah-production-schema-change/, path);
    assert.doesNotMatch(source, /khedmah-production-schema-(?:baseline-001-020|migration)/, path);
    assert.doesNotMatch(source, /khedmah-production-runtime-hardening/, path);
    assert.doesNotMatch(source, /khedmah-production-database-role-bootstrap/, path);
  }
});

test('production database runners reject a missing socket target before psql', () => {
  for (const path of productionDatabaseScripts) {
    const result = runScript(path, {
      DATABASE_URL: managedUrl('localhost/khedmah'),
    });
    assert.equal(result.status, 2, `${path}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /CLOUD_SQL_INSTANCE_CONNECTION_NAME is required for Production database operations/, path);
  }
});

test('production database runners reject localhost text hidden in a hostile URI path', () => {
  for (const path of productionDatabaseScripts) {
    const result = runScript(path, {
      DATABASE_URL: managedUrl('evil.example/khedmah@localhost/khedmah'),
      CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'khedma-dl:europe-west1:khedmah-v1-db',
    });
    assert.equal(result.status, 2, `${path}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /credentials are malformed|approved localhost authority/, path);
  }
});

test('production migration runners reject multiline scalar injection before psql or sha256sum', (t) => {
  const shimDirectory = mkdtempSync(join(tmpdir(), 'khedmah-production-scalar-test-'));
  t.after(() => rmSync(shimDirectory, { force: true, recursive: true }));

  for (const command of ['psql', 'sha256sum']) {
    const commandPath = join(shimDirectory, command);
    writeFileSync(commandPath, '#!/bin/sh\nprintf "%s\\n" "$0" >> "$COMMAND_MARKER"\nexit 99\n');
    chmodSync(commandPath, 0o755);
  }

  const validTarget = 'khedma-dl:europe-west1:khedmah-v1-db';
  const validPassword = 'a'.repeat(64);
  const scalarAttacks = [
    {
      label: 'Cloud SQL target',
      overrides: {
        CLOUD_SQL_INSTANCE_CONNECTION_NAME: `${validTarget}\nignored`,
        DATABASE_URL: managedUrl('localhost/khedmah'),
      },
      error: /invalid Cloud SQL instance connection name/,
    },
    {
      label: 'database user',
      overrides: {
        CLOUD_SQL_INSTANCE_CONNECTION_NAME: validTarget,
        DATABASE_MIGRATION_USER: 'khedmah_migrator\nignored',
        DATABASE_URL: `postgresql://khedmah_migrator\nignored:${validPassword}@localhost/khedmah`,
      },
      error: /DATABASE_MIGRATION_USER is malformed/,
    },
    {
      label: 'database name',
      overrides: {
        CLOUD_SQL_INSTANCE_CONNECTION_NAME: validTarget,
        DATABASE_NAME: 'khedmah\nignored',
        DATABASE_URL: `postgresql://khedmah_migrator:${validPassword}@localhost/khedmah\nignored`,
      },
      error: /DATABASE_NAME is malformed/,
    },
    {
      label: 'database password',
      overrides: {
        CLOUD_SQL_INSTANCE_CONNECTION_NAME: validTarget,
        DATABASE_URL: `postgresql://khedmah_migrator:${validPassword}\nignored@localhost/khedmah`,
      },
      error: /password must use the managed 256-bit hexadecimal format/,
    },
  ];

  let sequence = 0;
  for (const path of productionMigrationScripts) {
    for (const attack of scalarAttacks) {
      const marker = join(shimDirectory, `called-${sequence++}`);
      const result = runScript(path, {
        PATH: `${shimDirectory}:${process.env.PATH}`,
        COMMAND_MARKER: marker,
        ...attack.overrides,
      });
      assert.equal(result.status, 2, `${path}: ${attack.label}\n${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, attack.error, `${path}: ${attack.label}`);
      assert.equal(existsSync(marker), false, `${path}: ${attack.label} reached an external command`);
    }
  }

  const checksumAttacks = [
    ['scripts/run-production-baseline-001-020.sh', { BASELINE_MANIFEST_SHA256: `${validPassword}\nignored` }],
    ['scripts/run-production-migrations-025-034.sh', { MIGRATION_SHA256: `${validPassword}\nignored` }],
  ];
  for (const [path, overrides] of checksumAttacks) {
    const marker = join(shimDirectory, `called-${sequence++}`);
    const result = runScript(path, {
      PATH: `${shimDirectory}:${process.env.PATH}`,
      COMMAND_MARKER: marker,
      CLOUD_SQL_INSTANCE_CONNECTION_NAME: validTarget,
      DATABASE_URL: managedUrl('localhost/khedmah'),
      ...overrides,
    });
    assert.equal(result.status, 1, `${path}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /must be a lowercase SHA-256/, path);
    assert.equal(existsSync(marker), false, `${path}: multiline checksum reached sha256sum`);
  }
});

function managedUrl(authorityAndPath) {
  return `postgresql://khedmah_migrator:${'a'.repeat(64)}@${authorityAndPath}`;
}

function runScript(path, overrides) {
  const environment = {
    ...process.env,
    DATABASE_MIGRATION_USER: 'khedmah_migrator',
    DATABASE_NAME: 'khedmah',
    DATABASE_ROLE_PHASE: 'verify',
    DATABASE_RUNTIME_USER: 'khedmah_app',
    DATABASE_RUNTIME_ROLE: 'khedmah_runtime_role',
    DATABASE_MIGRATION_ROLE: 'khedmah_migration_role',
    MIGRATION_VERSION: '021_provider_reports',
    MIGRATION_SHA256: '61817e4c0c4e2830eb1fb64de8fbcd98c5d1469b60b1cd8dcfc800683bbab698',
    MIGRATION_NUMBER: '025',
    ...overrides,
  };
  delete environment.ALLOW_DESTRUCTIVE_DB_TESTS;
  delete environment.CI;
  return spawnSync('sh', [resolve(repositoryRoot, path)], {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    timeout: 5000,
  });
}
