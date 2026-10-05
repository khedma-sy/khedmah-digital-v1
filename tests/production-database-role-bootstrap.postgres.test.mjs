import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..');
const bootstrapPath = resolve(repositoryRoot, 'scripts/production-database-role-bootstrap.sh');
const destructiveTestsEnabled = process.env.ALLOW_DESTRUCTIVE_DB_TESTS === 'true';
const safeDisposableDatabase = /^[a-z0-9_]*(?:_test|_ci)$/;
const forbiddenDatabases = new Set(['postgres', 'template0', 'template1', 'khedmah', 'khedmah_dev', 'khedmah_prod', 'production']);

test('production database role bootstrap enforces PostgreSQL 16 role isolation', {
  skip: destructiveTestsEnabled ? false : 'ALLOW_DESTRUCTIVE_DB_TESTS is not true',
}, async (t) => {
  const providedAdminUrl = connectionUrl();
  const providedDatabase = decodeURIComponent(providedAdminUrl.pathname.replace(/^\//, ''));

  assertSafeDisposableDatabase(providedDatabase);
  assert.equal(providedAdminUrl.search, '', 'DESTRUCTIVE_DB_TESTS_REFUSE_CONNECTION_QUERY_OVERRIDES');
  assert.equal(providedAdminUrl.hash, '', 'DESTRUCTIVE_DB_TESTS_REFUSE_CONNECTION_FRAGMENT');
  assert.ok(['postgres:', 'postgresql:'].includes(providedAdminUrl.protocol),
    `DESTRUCTIVE_DB_TESTS_REQUIRE_POSTGRESQL_URI: ${providedAdminUrl.protocol}`);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(providedAdminUrl.hostname),
    `DESTRUCTIVE_DB_TESTS_REQUIRE_LOOPBACK: ${providedAdminUrl.hostname || '<missing>'}`);
  assertCommandAvailable('psql', ['--version']);

  // The repository test workflows share a service database with many other
  // suites and intentionally name its superuser `khedmah`. The production
  // bootstrap must keep rejecting that login, so run this cluster-wide
  // acceptance suite in its own PostgreSQL 16 container whenever the runner
  // exposes Docker. A caller without Docker may still provide a dedicated,
  // exact production-shaped cluster through the guarded connection variables.
  const adminUrl = await isolatedPostgresAdminUrl(t, providedAdminUrl);
  const adminDatabase = decodeURIComponent(adminUrl.pathname.replace(/^\//, ''));
  assertSafeDisposableDatabase(adminDatabase);
  if (!adminUrl.isolatedContainerName) {
    assert.equal(query(adminUrl, `
      SELECT pg_postmaster_start_time() >= clock_timestamp() - interval '50 minutes'
    `), 't',
    'DEDICATED_POSTGRES_RESTART_REQUIRED: restart the dedicated PostgreSQL 16 server immediately before this acceptance suite.');
  }
  assert.equal(query(adminUrl, "SELECT current_setting('server_version_num')::integer / 10000"), '16');
  assert.equal(query(adminUrl, 'SELECT rolsuper FROM pg_roles WHERE rolname=current_user'), 't',
    'The disposable PostgreSQL acceptance user must be a superuser so the test can construct unsafe role fixtures.');
  assert.equal(query(adminUrl, 'SELECT current_user'), 'postgres',
    'The disposable cluster must use the allowlisted PostgreSQL admin login.');
  assert.equal(query(adminUrl, `
    SELECT COALESCE(string_agg(rolname, ',' ORDER BY rolname), '')
    FROM pg_roles
    WHERE rolcanlogin
      AND rolname NOT IN (
        'postgres', 'cloudsqladmin', 'cloudsqlagent', 'cloudsqlconnpooladmin',
        'cloudsqlimportexport', 'cloudsqllogical', 'cloudsqlsuperuser',
        'cloudsqlobservability', 'cloudsqlreplica'
      )
  `), '', 'The disposable cluster must begin with no login outside the production allowlist.');

  const cloudSqlRoleExisted = query(adminUrl,
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cloudsqlsuperuser')") === 't';
  if (!cloudSqlRoleExisted) {
    execute(adminUrl,
      'CREATE ROLE cloudsqlsuperuser LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS');
  }
  assert.equal(query(adminUrl,
    "SELECT rolcanlogin FROM pg_roles WHERE rolname='cloudsqlsuperuser'"), 't',
    'The Cloud SQL superuser system role must be accepted as a login in the production inventory model.');

  try {
    await t.test('role-state probe classifies initial, resume, completed, and invalid membership sets without mutation', async () => {
      await withFixture(adminUrl, { createRogueUser: true }, async (fixture) => {
        const initial = runBootstrap(fixture, 'role-state');
        assertBootstrapSuccess(initial, 'initial role-state probe');
        assert.equal(initial.stdout.trim(), 'DATABASE_ROLE_PREPARE_STATE=initial');
        assert.equal(query(adminUrl, `
          SELECT count(*) FROM pg_roles
          WHERE rolname IN (${literal(fixture.runtimeRole)}, ${literal(fixture.migrationRole)})
        `), '0', 'The role-state probe must not create custom roles.');

        assertBootstrapSuccess(runBootstrap(fixture, 'prepare'), 'role-state fixture prepare');
        const stillInitial = runBootstrap(fixture, 'role-state');
        assertBootstrapSuccess(stillInitial, 'post-prepare role-state probe');
        assert.equal(stillInitial.stdout.trim(), 'DATABASE_ROLE_PREPARE_STATE=initial');

        replaceRuntimeMembership(fixture, { runtimeInherit: true, runtimeAdmin: false });
        const resume = runBootstrap(fixture, 'role-state');
        assertBootstrapSuccess(resume, 'resume role-state probe');
        assert.equal(resume.stdout.trim(), 'DATABASE_ROLE_PREPARE_STATE=resume');

        demoteMigrationMembership(fixture);
        const completed = runBootstrap(fixture, 'role-state');
        assertBootstrapSuccess(completed, 'completed role-state probe');
        assert.equal(completed.stdout.trim(), 'DATABASE_ROLE_PREPARE_STATE=completed');

        execute(adminUrl, `
          GRANT ${identifier(fixture.rogueUser)} TO ${identifier(fixture.runtimeUser)}
            WITH INHERIT TRUE, SET TRUE, ADMIN FALSE
        `);
        const invalid = runBootstrap(fixture, 'role-state');
        assert.equal(invalid.status, 12, diagnostic('role-state accepted an unexpected membership', invalid));
        assert.equal(invalid.stdout.trim(), 'DATABASE_ROLE_PREPARE_STATE=invalid');
        assert.match(invalid.stderr, /DATABASE_ROLE_PREPARE_STATE_INVALID/);
      });
    });

    await t.test('role-state probe accepts valid custom role names independent of lexical order', async () => {
      await withFixture(adminUrl, { createRogueUser: true, lexicalRoleOrderProbe: true }, async (fixture) => {
        assert.ok(fixture.runtimeRole < 'cloudsqlsuperuser');
        assert.ok(fixture.migrationRole > 'cloudsqlsuperuser');

        assertBootstrapSuccess(runBootstrap(fixture, 'prepare'), 'lexical-order fixture prepare');
        const prepared = runBootstrap(fixture, 'role-state');
        assertBootstrapSuccess(prepared, 'lexical-order post-prepare role-state probe');
        assert.equal(prepared.stdout.trim(), 'DATABASE_ROLE_PREPARE_STATE=initial');

        replaceRuntimeMembership(fixture, { runtimeInherit: true, runtimeAdmin: false });
        const resume = runBootstrap(fixture, 'role-state');
        assertBootstrapSuccess(resume, 'lexical-order resume role-state probe');
        assert.equal(resume.stdout.trim(), 'DATABASE_ROLE_PREPARE_STATE=resume');

        demoteMigrationMembership(fixture);
        const completed = runBootstrap(fixture, 'role-state');
        assertBootstrapSuccess(completed, 'lexical-order completed role-state probe');
        assert.equal(completed.stdout.trim(), 'DATABASE_ROLE_PREPARE_STATE=completed');
      });
    });

    await t.test('prepare, cutover, verify, and harden preserve exact safe state', async () => {
      await withFixture(adminUrl, { createRogueUser: true }, async (fixture) => {
        assert.equal(query(adminUrl, `
          SELECT rolcanlogin FROM pg_roles WHERE rolname=${literal(fixture.rogueUser)}
        `), 'f', 'Auxiliary grantee fixtures must not expand the login allowlist.');
        assert.equal(new URL(fixture.migrationUrl).searchParams.has('options'), false);
        assert.equal(query(fixture.migrationUrl,
          "SELECT current_role || '|' || current_setting('search_path')", {
            PGOPTIONS: '-c role=none -c search_path=pg_catalog',
          }), `${fixture.migrationUser}|pg_catalog`);

        execute(fixture.adminDatabaseUrl, `
          GRANT CREATE ON DATABASE ${identifier(fixture.databaseName)} TO ${identifier(fixture.runtimeUser)};
          GRANT CREATE ON SCHEMA public TO ${identifier(fixture.runtimeUser)};
        `);
        setMigrationLoginSettings(fixture);
        assert.equal(query(fixture.adminDatabaseUrl, runtimePrebaselinePrivilegeQuery(fixture)), 't|t|t',
          'The fixture must expose inherited database-owner privileges before prepare.');
        assert.equal(query(fixture.adminDatabaseUrl, directRuntimeAclCountQuery(fixture)), '1|1',
          'The fixture must expose direct runtime-user CREATE ACLs before prepare.');

        assertBootstrapSuccess(runBootstrap(fixture, 'prepare'), 'first prepare');
        assertBootstrapSuccess(runBootstrap(fixture, 'prepare'), 'repeated prepare');
        assert.equal(query(fixture.adminDatabaseUrl, applicationLoginSettingCountQuery(fixture)), '0|0|0',
          'Prepare must leave both application logins with no persistent role settings.');
        assert.equal(query(fixture.adminDatabaseUrl, canonicalPrebaselineDefaultAclQuery(fixture)), 't',
          'Prepare must leave only the canonical owner-only routine default ACL.');
        for (const systemDatabase of ['postgres', 'template1']) {
          const systemDatabaseUrl = new URL(fixture.adminUrl);
          systemDatabaseUrl.pathname = `/${systemDatabase}`;
          assert.equal(query(systemDatabaseUrl, 'SELECT count(*) FROM pg_default_acl'), '0',
            `${systemDatabase} must retain a zero-default-ACL fresh catalog.`);
        }
        assert.equal(query(connectionUrl({
          baseUrl: fixture.adminUrl,
          databaseName: fixture.databaseName,
          username: fixture.runtimeUser,
          password: fixture.runtimePassword,
        }), "SELECT current_role || '|' || current_setting('search_path')", {
          PGOPTIONS: '-c role=none -c search_path=pg_catalog,public',
        }), `${fixture.runtimeUser}|pg_catalog,public`,
        'The runtime client must supply role=none and its safe search_path at startup.');
        assert.equal(query(fixture.adminDatabaseUrl, runtimePrebaselinePrivilegeQuery(fixture)), 't|t|t',
          'Prepare cannot remove privileges inherited from the database-owning legacy role before containment.');
        assert.equal(query(fixture.adminDatabaseUrl, directRuntimeAclCountQuery(fixture)), '0|0',
          'Prepare must remove direct runtime-user ACLs before containment.');
        assert.equal(query(fixture.adminDatabaseUrl, preparedRuntimeRoleAclQuery(fixture)), '1|1|0',
          'Prepare must stage only non-grantable CONNECT for the runtime role.');
        assert.equal(query(fixture.adminDatabaseUrl, `
          SELECT count(*)
          FROM pg_roles
          WHERE rolname IN (${literal(fixture.runtimeRole)}, ${literal(fixture.migrationRole)})
            AND NOT rolcanlogin AND rolinherit
            AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
            AND NOT rolreplication AND NOT rolbypassrls
        `), '2');

        const stalePrivilegedSessions = [];
        const postRestartSessions = [];
        try {
          setMigrationLoginSettings(fixture);
          stalePrivilegedSessions.push(
            await openPrivilegedSession(fixture, fixture.runtimeUser, fixture.runtimePassword),
          );
          stalePrivilegedSessions.push(
            await openPrivilegedSession(fixture, fixture.migrationUser, fixture.migrationPassword),
          );
          rotateMigrationPassword(fixture);
          const transitionProbe = runBootstrap(fixture, 'probe');
          assertBootstrapSuccess(transitionProbe, 'transition migration credential probe');
          assert.equal(transitionProbe.stdout.trim(), 'DATABASE_MIGRATION_CREDENTIAL_VERIFIED');
          assert.equal(query(adminUrl, applicationLoginSettingCountQuery(fixture)), '0|3|3',
            'Credential probing must not mutate the three migration login settings.');
          const jobMigrationPasswordHash = query(adminUrl, `
            SELECT rolpassword
            FROM pg_authid
            WHERE rolname=${literal(fixture.migrationUser)}
          `);
          assert.notEqual(jobMigrationPasswordHash, '');
          replaceRuntimeMembership(fixture, { runtimeInherit: true, runtimeAdmin: false });
          assert.equal(query(fixture.adminDatabaseUrl, runtimePrebaselinePrivilegeQuery(fixture)), 'f|f|f',
            'Runtime containment must remove effective owner privileges before cutover-audit.');
          assert.equal(query(adminUrl, membershipQuery(fixture)), [
            `cloudsqlsuperuser|${fixture.migrationUser}|t|t|f`,
            `${fixture.migrationRole}|${fixture.migrationUser}|f|f|t`,
            `${fixture.runtimeRole}|${fixture.migrationUser}|f|f|t`,
            `${fixture.runtimeRole}|${fixture.runtimeUser}|t|t|f`,
          ].join('\n'),
          'The runtime login is contained while PostgreSQL retains the creator ADMIN memberships until migration demotion.');

          const restartNotBeforeMillis = await restartIsolatedPostgres(fixture);
          if (restartNotBeforeMillis === null) {
            // A caller that supplied a dedicated cluster instead of Docker is
            // responsible for platform restart semantics. End the synthetic
            // pre-cutover clients and use that server's already-started fence.
            await terminateSessionsFromAdmin(adminUrl, stalePrivilegedSessions);
            fixture.cutoverRestartNotBeforeMillis = testRestartFenceMillis(adminUrl);
          } else {
            fixture.cutoverRestartNotBeforeMillis = restartNotBeforeMillis;
            const restartedSessions = await waitForPrivilegedSessionTermination(stalePrivilegedSessions);
            for (const outcome of restartedSessions) {
              assert.notEqual(outcome.code, 0,
                diagnostic('the instance restart left a stale privileged session alive', outcome));
              assert.equal(outcome.signal, null,
                diagnostic('the stale psql client should observe a server-side restart', outcome));
            }
          }
          await waitForNoActiveSessions(adminUrl, stalePrivilegedSessions,
            'The mandatory restart must leave no pre-cutover privileged session alive.');

          postRestartSessions.push(
            await openPrivilegedSession(fixture, fixture.migrationUser, fixture.migrationPassword),
          );
          postRestartSessions.push(
            await openPrivilegedSession(
              fixture, fixture.runtimeUser, fixture.runtimePassword, null,
            ),
          );
          assertBootstrapSuccess(runBootstrap(fixture, 'cutover-audit'), 'cutover audit');
          const terminatedMigrationSession = await waitForPrivilegedSessionTermination([
            postRestartSessions[0],
          ]);
          assert.notEqual(terminatedMigrationSession[0].code, 0,
            diagnostic('cutover-audit did not terminate its sibling migration session',
              terminatedMigrationSession[0]));
          assert.equal(terminatedMigrationSession[0].signal, null,
            diagnostic('the sibling migration client should observe server-side termination',
              terminatedMigrationSession[0]));
          assert.equal(query(adminUrl, activeSessionCountQuery([postRestartSessions[1]])), '1',
            'Cutover-audit must not require cross-user signaling for a new confined runtime session.');
          await stopPrivilegedSessions([postRestartSessions[1]]);
          assert.equal(query(adminUrl, applicationLoginSettingCountQuery(fixture)), '0|0|0',
            'Cutover-audit must RESET ALL global and database-scoped migration settings.');
          assert.equal(query(fixture.adminDatabaseUrl, canonicalPrebaselineDefaultAclQuery(fixture)), 't',
            'Cutover-audit must preserve the canonical target default ACL.');
          const disconnectedMigrationPasswordHash = query(adminUrl, `
            SELECT rolpassword
            FROM pg_authid
            WHERE rolname=${literal(fixture.migrationUser)}
          `);
          assert.notEqual(disconnectedMigrationPasswordHash, '');
          assert.notEqual(disconnectedMigrationPasswordHash, jobMigrationPasswordHash,
            'Cutover-audit must replace the workflow-known migration password.');
          const disconnectedCredential = runPsql(fixture.migrationUrl, 'SELECT 1');
          assert.notEqual(disconnectedCredential.status, 0,
            diagnostic('the pre-cutover migration credential still authenticated', disconnectedCredential));
        } finally {
          await stopPrivilegedSessions(postRestartSessions);
          await stopPrivilegedSessions(stalePrivilegedSessions);
        }

        demoteMigrationMembership(fixture);
        assert.equal(query(adminUrl, `
          SELECT
            NOT pg_has_role(${literal(fixture.migrationUser)}, 'cloudsqlsuperuser', 'member'),
            pg_has_role(${literal(fixture.migrationUser)}, ${literal(fixture.migrationRole)}, 'usage'),
            rolpassword IS NOT NULL
          FROM pg_authid
          WHERE rolname=${literal(fixture.migrationUser)}
        `), 't|t|t', 'The migration login must be demoted while its known credential is disconnected.');
        rotateMigrationPassword(fixture);
        const finalProbe = runBootstrap(fixture, 'probe');
        assertBootstrapSuccess(finalProbe, 'final migration credential probe');
        assert.equal(finalProbe.stdout.trim(), 'DATABASE_MIGRATION_CREDENTIAL_VERIFIED',
          'The rotated migration credential must reconnect only after role demotion.');

        assert.equal(query(adminUrl, membershipQuery(fixture)), [
          `${fixture.migrationRole}|${fixture.migrationUser}|t|t|f`,
          `${fixture.runtimeRole}|${fixture.runtimeUser}|t|t|f`,
        ].join('\n'));
        assertBootstrapSuccess(runBootstrap(fixture, 'verify'), 'first verify');
        assertBootstrapSuccess(runBootstrap(fixture, 'verify'), 'repeated verify');

        replaceRuntimeMembership(fixture, { runtimeInherit: false, runtimeAdmin: false });
        assertBootstrapRejected(runBootstrap(fixture, 'verify'), 7, 'non-inheriting runtime membership');

        replaceRuntimeMembership(fixture, { runtimeInherit: true, runtimeAdmin: true });
        assertBootstrapRejected(runBootstrap(fixture, 'verify'), 7, 'runtime membership with ADMIN OPTION');

        replaceRuntimeMembership(fixture, { runtimeInherit: true, runtimeAdmin: false });
        assert.equal(query(adminUrl, membershipQuery(fixture)), [
          `${fixture.migrationRole}|${fixture.migrationUser}|t|t|f`,
          `${fixture.runtimeRole}|${fixture.runtimeUser}|t|t|f`,
        ].join('\n'));

        execute(adminUrl, `
          GRANT ${identifier(fixture.runtimeRole)} TO ${identifier(fixture.rogueUser)}
            WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
        `);
        assertBootstrapRejected(runBootstrap(fixture, 'verify'), 7, 'unexpected runtime-role grantee');
        execute(adminUrl, `
          REVOKE ${identifier(fixture.runtimeRole)} FROM ${identifier(fixture.rogueUser)};
        `);

        execute(fixture.adminDatabaseUrl, `
          REVOKE GRANT OPTION FOR CONNECT, CREATE ON DATABASE ${identifier(fixture.databaseName)}
            FROM ${identifier(fixture.migrationRole)};
          REVOKE GRANT OPTION FOR USAGE, CREATE ON SCHEMA public
            FROM ${identifier(fixture.migrationRole)};
          GRANT CONNECT, CREATE ON DATABASE ${identifier(fixture.databaseName)}
            TO ${identifier(fixture.migrationUser)} WITH GRANT OPTION;
          GRANT USAGE, CREATE ON SCHEMA public
            TO ${identifier(fixture.migrationUser)} WITH GRANT OPTION;
        `);
        assertBootstrapRejected(runBootstrap(fixture, 'verify'), 7,
          'grant options moved from the migration role directly to its login user');
        execute(fixture.adminDatabaseUrl, `
          GRANT CONNECT, CREATE ON DATABASE ${identifier(fixture.databaseName)}
            TO ${identifier(fixture.migrationRole)} WITH GRANT OPTION;
          GRANT USAGE, CREATE ON SCHEMA public
            TO ${identifier(fixture.migrationRole)} WITH GRANT OPTION;
          REVOKE CONNECT, CREATE ON DATABASE ${identifier(fixture.databaseName)}
            FROM ${identifier(fixture.migrationUser)};
          REVOKE USAGE, CREATE ON SCHEMA public
            FROM ${identifier(fixture.migrationUser)};
        `);

        assertBootstrapSuccess(runBootstrap(fixture, 'verify'), 'first verify');
        assertBootstrapSuccess(runBootstrap(fixture, 'verify'), 'repeated verify');
        assert.equal(query(fixture.adminDatabaseUrl, runtimeConnectGrantorQuery(fixture)), '1',
          'Repeated prepare must not duplicate runtime CONNECT ACLs.');
        execute(fixture.migrationUrl, `
          CREATE TABLE public.pg_roles (rolname text);
          CREATE TABLE public.pg_auth_members (roleid oid);
        `, { PGOPTIONS: '-c role=none -c search_path=pg_catalog' });
        createCanonicalHardeningFixture(fixture);
        execute(fixture.adminDatabaseUrl, `
          GRANT DELETE ON khedmah_taxi.driver_approvals TO ${identifier(fixture.runtimeUser)};
          GRANT SELECT(user_id), UPDATE(user_id)
            ON khedmah_taxi.driver_approvals TO ${identifier(fixture.runtimeUser)};
          GRANT SELECT(id), UPDATE(id)
            ON khedmah_taxi.vehicle_approvals TO ${identifier(fixture.runtimeRole)};
          GRANT TRUNCATE ON public.core_user_accounts TO PUBLIC;
          GRANT DELETE ON khedmah_taxi.operational_approval_events TO PUBLIC;
          GRANT SELECT(user_id) ON khedmah_taxi.driver_approvals TO PUBLIC;
          GRANT EXECUTE ON FUNCTION khedmah_taxi.resolve_actor_locked(text, boolean) TO PUBLIC;
        `);
        execute(fixture.migrationUrl, `
          ALTER DEFAULT PRIVILEGES IN SCHEMA khedmah_taxi
            GRANT DELETE ON TABLES TO PUBLIC;
        `);
        assertBootstrapRejected(runBootstrap(fixture, 'verify'), 7,
          'repairable default ACL drift outside harden');
        assert.equal(query(fixture.adminDatabaseUrl, `
          SELECT
            has_table_privilege(
              ${literal(fixture.runtimeUser)}, 'khedmah_taxi.driver_approvals', 'DELETE'
            ),
            has_column_privilege(
              ${literal(fixture.runtimeUser)}, 'khedmah_taxi.driver_approvals', 'user_id', 'UPDATE'
            ),
            has_column_privilege(
              ${literal(fixture.runtimeUser)}, 'khedmah_taxi.vehicle_approvals', 'id', 'UPDATE'
            ),
            has_table_privilege(
              ${literal(fixture.runtimeUser)}, 'public.core_user_accounts', 'TRUNCATE'
            ),
            has_table_privilege(
              ${literal(fixture.runtimeUser)}, 'khedmah_taxi.operational_approval_events', 'DELETE'
            )
        `), 't|t|t|t|t',
        'The fixture must expose direct and PUBLIC table/column ACLs before hardening.');
        assertBootstrapSuccess(runBootstrap(fixture, 'harden'), 'first harden');
        assert.equal(query(fixture.adminDatabaseUrl, publicRuntimeAclCountQuery(fixture)), '0|0|0|0',
          'Hardening must remove current and future PUBLIC access in application schemas.');
        assert.equal(query(fixture.adminDatabaseUrl, runtimeConnectGrantorQuery(fixture)), '1',
          'Hardening must preserve one direct runtime CONNECT ACL without a new grantor row.');
        const firstHardeningSnapshot = query(fixture.adminDatabaseUrl, runtimePrivilegeSnapshotQuery(fixture));
        assertBootstrapSuccess(runBootstrap(fixture, 'harden'), 'repeated harden');
        assertBootstrapSuccess(runBootstrap(fixture, 'verify'), 'verify after harden');
        assert.equal(query(fixture.adminDatabaseUrl, canonicalHardenedDefaultAclQuery(fixture)), 't',
          'Harden must leave exactly owner EXECUTE plus runtime sequence USAGE/SELECT defaults.');

        execute(fixture.migrationUrl, `
          ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT USAGE ON SEQUENCES TO ${identifier(fixture.rogueUser)}
        `);
        const rogueDefaultAcl = runBootstrap(fixture, 'verify-hardened');
        assert.equal(rogueDefaultAcl.status, 7,
          diagnostic('hardened verification accepted a rogue default ACL grantee', rogueDefaultAcl));
        assert.match(rogueDefaultAcl.stderr, /DATABASE_ROLE_ISOLATION_NOT_READY/);
        const unrepairableDefaultAcl = runBootstrap(fixture, 'harden');
        assert.notEqual(unrepairableDefaultAcl.status, 0,
          diagnostic('harden committed an unrepairable rogue default ACL', unrepairableDefaultAcl));
        assert.match(unrepairableDefaultAcl.stderr,
          /RUNTIME_DATABASE_HARDENING_POSTCONDITION_FAILED/);
        assert.equal(query(fixture.adminDatabaseUrl, `
          SELECT count(*)
          FROM pg_default_acl defaults
          CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE privilege.grantee=(
            SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.rogueUser)}
          )
        `), '1', 'A failed harden must roll back every attempted ACL repair.');
        execute(fixture.migrationUrl, `
          ALTER DEFAULT PRIVILEGES IN SCHEMA public
            REVOKE ALL ON SEQUENCES FROM ${identifier(fixture.rogueUser)}
        `);
        assert.equal(query(fixture.adminDatabaseUrl, canonicalHardenedDefaultAclQuery(fixture)), 't',
          'Removing the rogue grantee must restore the exact two-entry public sequence ACL.');
        assertBootstrapSuccess(runBootstrap(fixture, 'verify-hardened'),
          'hardened verification after rogue default ACL cleanup');

        execute(fixture.migrationUrl, `
          CREATE TABLE public.future_runtime_guard (
            id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
          );
          CREATE TABLE khedmah_taxi.future_runtime_guard (id text PRIMARY KEY);
        `);
        assert.equal(query(fixture.adminDatabaseUrl, futureRuntimePrivilegeQuery(fixture)),
          'f|f|f|f|f|f|f|t|t|f|f|f|f|f',
          'Defaults must grant only public sequence USAGE/SELECT and no future table privileges.');
        const newlyCreatedPublicTable = runBootstrap(fixture, 'verify-hardened');
        assert.equal(newlyCreatedPublicTable.status, 9,
          diagnostic('hardened verification accepted an ungranted new public table', newlyCreatedPublicTable));
        assert.match(newlyCreatedPublicTable.stderr, /RUNTIME_DATABASE_HARDENING_POSTCONDITION_FAILED/);
        assertBootstrapSuccess(runBootstrap(fixture, 'harden'), 'harden after creating a public table');
        assert.equal(query(fixture.adminDatabaseUrl, futureRuntimePrivilegeQuery(fixture)),
          't|t|t|t|f|f|f|t|t|f|f|f|f|f',
          'Harden must grant exact DML on existing public tables while leaving Taxi defaults empty.');
        assertBootstrapSuccess(runBootstrap(fixture, 'verify-hardened'), 'read-only hardened verification');
        execute(fixture.migrationUrl, `
          CREATE SCHEMA ${identifier(fixture.secretSchema)};
          CREATE TABLE ${identifier(fixture.secretSchema)}.private_runtime_guard (id text PRIMARY KEY);
          GRANT USAGE ON SCHEMA ${identifier(fixture.secretSchema)} TO ${identifier(fixture.runtimeUser)};
          GRANT SELECT ON ${identifier(fixture.secretSchema)}.private_runtime_guard
            TO ${identifier(fixture.runtimeUser)};
        `);
        const unsafeDirectAcl = runBootstrap(fixture, 'verify-hardened');
        assert.equal(unsafeDirectAcl.status, 9,
          diagnostic('hardened verification accepted out-of-scope direct runtime ACLs', unsafeDirectAcl));
        assert.match(unsafeDirectAcl.stderr, /RUNTIME_DATABASE_HARDENING_POSTCONDITION_FAILED/);
        execute(fixture.migrationUrl, `
          REVOKE SELECT ON ${identifier(fixture.secretSchema)}.private_runtime_guard
            FROM ${identifier(fixture.runtimeUser)};
          REVOKE USAGE ON SCHEMA ${identifier(fixture.secretSchema)}
            FROM ${identifier(fixture.runtimeUser)};
          DROP SCHEMA ${identifier(fixture.secretSchema)} CASCADE;
        `);
        execute(fixture.adminDatabaseUrl,
          `CREATE SCHEMA ${identifier(fixture.rogueSchema)} AUTHORIZATION ${identifier(fixture.runtimeUser)}`);
        const unsafeOwnership = runBootstrap(fixture, 'verify-hardened');
        assert.equal(unsafeOwnership.status, 9,
          diagnostic('hardened verification accepted runtime-user ownership', unsafeOwnership));
        assert.match(unsafeOwnership.stderr, /RUNTIME_DATABASE_HARDENING_POSTCONDITION_FAILED/);

        assert.equal(firstHardeningSnapshot, 't|f|t|f|t|f|f|f|f|t');
        assert.equal(query(fixture.adminDatabaseUrl, runtimePrivilegeSnapshotQuery(fixture)), firstHardeningSnapshot,
          'Repeated hardening must preserve the effective runtime privilege snapshot.');
      });
    });

    await t.test('prepare rejects a login outside the production allowlist', async () => {
      await withFixture(adminUrl, { unexpectedLogin: true }, async (fixture) => {
        assert.equal(query(adminUrl, `
          SELECT rolcanlogin FROM pg_roles WHERE rolname=${literal(fixture.rogueUser)}
        `), 't');
        const result = runBootstrap(fixture, 'prepare');
        assert.equal(result.status, 3, diagnostic('prepare accepted an unexpected login', result));
        assert.match(result.stderr, /DATABASE_INSTANCE_IDENTITY_INVENTORY_NOT_SAFE/);
        assert.equal(query(adminUrl, `
          SELECT count(*) FROM pg_roles
          WHERE rolname IN (${literal(fixture.runtimeRole)}, ${literal(fixture.migrationRole)})
        `), '0', 'The rejected prepare transaction must roll back custom role creation.');
      });
    });

    await t.test('inventory manifest binds database connectivity attributes', async () => {
      await withFixture(adminUrl, {}, async (fixture) => {
        execute(adminUrl,
          `ALTER DATABASE ${identifier(fixture.databaseName)} CONNECTION LIMIT 7`);
        const result = runBootstrap(fixture, 'prepare');
        assert.equal(result.status, 11,
          diagnostic('prepare accepted database-attribute drift after inventory', result));
        assert.match(result.stderr, /DATABASE_SYSTEM_ROLE_MANIFEST_MISMATCH/);
      });
    });

    await t.test('cutover rejects every non-fresh target catalog surface', async (freshness) => {
      const scenarios = [
        {
          name: 'public catalog object',
          mutate(fixture) {
            execute(fixture.migrationUrl,
              'CREATE TABLE public.prebaseline_catalog_blocker (id integer PRIMARY KEY)');
          },
        },
        {
          name: 'default ACL row',
          mutate(fixture) {
            execute(fixture.migrationUrl, `
              ALTER DEFAULT PRIVILEGES IN SCHEMA public
                GRANT SELECT ON TABLES TO PUBLIC
            `);
          },
        },
        {
          name: 'database PUBLIC CREATE',
          mutate(fixture) {
            execute(fixture.adminDatabaseUrl,
              `GRANT CREATE ON DATABASE ${identifier(fixture.databaseName)} TO PUBLIC`);
          },
        },
      ];

      for (const scenario of scenarios) {
        await freshness.test(scenario.name, async () => {
          await withFixture(adminUrl, {}, async (fixture) => {
            assertBootstrapSuccess(runBootstrap(fixture, 'prepare'), 'freshness fixture prepare');
            assert.equal(query(fixture.adminDatabaseUrl, canonicalPrebaselineDefaultAclQuery(fixture)), 't',
              'Prepare must preserve the canonical target default ACL invariant.');
            replaceRuntimeMembership(fixture, { runtimeInherit: true, runtimeAdmin: false });
            scenario.mutate(fixture);
            rotateMigrationPassword(fixture);

            const result = runBootstrap(fixture, 'cutover-audit');
            assert.equal(result.status, 10,
              diagnostic(`cutover accepted ${scenario.name}`, result));
            assert.match(result.stderr, /DATABASE_PREBASELINE_CATALOG_NOT_FRESH/);
            assert.match(result.stderr, new RegExp(`${fixture.databaseName}$`, 'm'));
          });
        });
      }
    });

    await t.test('cutover rejects non-target application CREATE ACLs and recovers after cleanup', async () => {
      await withFixture(adminUrl, {}, async (fixture) => {
        assertBootstrapSuccess(runBootstrap(fixture, 'prepare'), 'non-target ACL fixture prepare');
        replaceRuntimeMembership(fixture, { runtimeInherit: true, runtimeAdmin: false });
        rotateMigrationPassword(fixture);

        const postgresAdminUrl = new URL(fixture.adminUrl);
        postgresAdminUrl.pathname = '/postgres';
        try {
          execute(postgresAdminUrl,
            `GRANT CREATE ON SCHEMA public TO ${identifier(fixture.migrationRole)}`);
          assert.equal(query(postgresAdminUrl,
            directPublicSchemaCreateAclCountQuery(fixture.migrationRole)), '1',
          'The negative fixture must install one direct CREATE ACL on postgres.public.');

          const blocked = runBootstrap(fixture, 'cutover-audit');
          assert.equal(blocked.status, 10,
            diagnostic('cutover accepted a non-target application CREATE ACL', blocked));
          assert.match(blocked.stderr, /DATABASE_PREBASELINE_CATALOG_NOT_FRESH: postgres/);
        } finally {
          execute(postgresAdminUrl,
            `REVOKE CREATE ON SCHEMA public FROM ${identifier(fixture.migrationRole)}`);
        }

        assert.equal(query(postgresAdminUrl,
          directPublicSchemaCreateAclCountQuery(fixture.migrationRole)), '0',
        'The non-target direct CREATE ACL must be removed before retrying cutover.');
        assertBootstrapSuccess(runBootstrap(fixture, 'cutover-audit'),
          'cutover after non-target ACL cleanup');
      });
    });

    await t.test('cutover rejects missing, malformed, future, and stale restart fences', async () => {
      await withFixture(adminUrl, {}, async (fixture) => {
        assertBootstrapSuccess(runBootstrap(fixture, 'prepare'), 'restart-fence fixture prepare');
        replaceRuntimeMembership(fixture, { runtimeInherit: true, runtimeAdmin: false });
        rotateMigrationPassword(fixture);

        for (const [name, overrides, status, error] of [
          [
            'missing',
            { omitCutoverRestartMarker: true },
            2,
            /DATABASE_CUTOVER_RESTART_NOT_BEFORE_MILLIS is required/,
          ],
          [
            'malformed',
            { cutoverRestartNotBeforeMillis: 'not-an-epoch' },
            2,
            /DATABASE_CUTOVER_RESTART_NOT_BEFORE_MILLIS is required/,
          ],
          [
            'future',
            { cutoverRestartNotBeforeMillis: String(Date.now() + 3_600_000) },
            10,
            /DATABASE_CUTOVER_RESTART_NOT_PROVEN/,
          ],
          [
            'stale',
            { cutoverRestartNotBeforeMillis: String(Date.now() - 7_200_000) },
            10,
            /DATABASE_CUTOVER_RESTART_NOT_PROVEN/,
          ],
        ]) {
          const result = runBootstrap(fixture, 'cutover-audit', overrides);
          assert.equal(result.status, status,
            diagnostic(`cutover accepted a ${name} restart fence`, result));
          assert.match(result.stderr, error);
        }
      });
    });

    await t.test('prepare rejects every PostgreSQL special privilege before grants', async (specialPrivilege) => {
      for (const unsafeTarget of ['custom role', 'login user']) {
        await specialPrivilege.test(unsafeTarget, async (targetTest) => {
          for (const unsafeAttribute of ['SUPERUSER', 'REPLICATION', 'BYPASSRLS']) {
            await targetTest.test(unsafeAttribute, async () => {
              const options = unsafeTarget === 'custom role'
                ? { unsafeRuntimeRoleAttribute: unsafeAttribute }
                : { unsafeRuntimeUserAttribute: unsafeAttribute };
              await withFixture(adminUrl, options, async (fixture) => {
                const result = runBootstrap(fixture, 'prepare');
                assert.notEqual(result.status, 0, diagnostic('unsafe prepare unexpectedly succeeded', result));
                assert.match(result.stderr, unsafeTarget === 'custom role'
                  ? /DATABASE_ROLE_CUSTOM_ROLE_ATTRIBUTES_NOT_SAFE/
                  : /DATABASE_ROLE_LOGIN_BASE_ATTRIBUTES_NOT_SAFE/);
                if (unsafeTarget === 'custom role') {
                  assert.equal(query(fixture.adminDatabaseUrl, `
                    SELECT
                      has_database_privilege(${literal(fixture.migrationRole)}, ${literal(fixture.databaseName)}, 'CREATE'),
                      has_schema_privilege(${literal(fixture.migrationRole)}, 'public', 'CREATE')
                  `), 'f|f', 'The rejected prepare transaction must not leave database or schema grants behind.');
                } else {
                  assert.equal(query(adminUrl, `
                    SELECT count(*) FROM pg_roles
                    WHERE rolname IN (${literal(fixture.runtimeRole)}, ${literal(fixture.migrationRole)})
                  `), '0', 'Roles created in the rejected prepare transaction must be rolled back.');
                }
              });
            });
          }
        });
      }
    });

    await t.test('prepare rejects unsafe direct, cross, and transitive grantees before ACL grants', async (grantees) => {
      const scenarios = [
        {
          name: 'third-party custom-role grantee',
          options: { rogueCustomRoleGrantee: true },
          error: /DATABASE_ROLE_CUSTOM_ROLE_GRANTEES_NOT_SAFE/,
        },
        {
          name: 'runtime user on migration role',
          options: { runtimeMigrationCrossMembership: true },
          error: /DATABASE_ROLE_CUSTOM_ROLE_GRANTEES_NOT_SAFE/,
        },
        {
          name: 'migration login granted transitively to a rogue user',
          options: { transitiveLoginGrantee: true },
          error: /DATABASE_ROLE_LOGIN_GRANTEES_NOT_SAFE/,
        },
      ];

      for (const scenario of scenarios) {
        await grantees.test(scenario.name, async () => {
          await withFixture(adminUrl, scenario.options, async (fixture) => {
            const result = runBootstrap(fixture, 'prepare');
            assert.notEqual(result.status, 0, diagnostic('prepare accepted an unsafe role grantee', result));
            assert.match(result.stderr, scenario.error);
            assert.equal(query(fixture.adminDatabaseUrl, `
              SELECT
                has_database_privilege(${literal(fixture.migrationRole)}, ${literal(fixture.databaseName)}, 'CREATE'),
                has_schema_privilege(${literal(fixture.migrationRole)}, 'public', 'CREATE')
            `), 'f|f', 'Rejected prepare must not retain migration-role ACL grants.');
          });
        });
      }
    });

    await t.test('prepare rejects runtime-user ownership before creating or granting custom roles', async () => {
      await withFixture(adminUrl, { runtimeOwnership: true }, async (fixture) => {
        const result = runBootstrap(fixture, 'prepare');
        assert.notEqual(result.status, 0, diagnostic('prepare accepted runtime-user ownership', result));
        assert.match(result.stderr, /DATABASE_ROLE_OWNERSHIP_NOT_SAFE/);
        assert.equal(query(adminUrl, `
          SELECT count(*) FROM pg_roles
          WHERE rolname IN (${literal(fixture.runtimeRole)}, ${literal(fixture.migrationRole)})
        `), '0', 'Rejected prepare must roll back custom roles created in its transaction.');
      });
    });

    await t.test('prepare rejects every persistent runtime login setting', async (settings) => {
      const scenarios = [
        {
          name: 'global runtime setting',
          options: { runtimeGlobalSetting: true },
          error: /DATABASE_ROLE_RUNTIME_CONFIG_NOT_SAFE/,
        },
        {
          name: 'unexpected database-scoped runtime setting',
          options: { runtimeUnexpectedDatabaseSetting: true },
          error: /DATABASE_ROLE_RUNTIME_CONFIG_NOT_SAFE/,
        },
        {
          name: 'unexpected other-database runtime setting',
          options: { runtimeUnexpectedOtherDatabaseSetting: true },
          error: /DATABASE_ROLE_RUNTIME_CONFIG_NOT_SAFE/,
        },
        {
          name: 'schema matching the runtime login',
          options: { runtimeNamedSchema: true },
          error: /DATABASE_ROLE_RUNTIME_SCHEMA_NOT_SAFE/,
        },
      ];

      for (const scenario of scenarios) {
        await settings.test(scenario.name, async () => {
          await withFixture(adminUrl, scenario.options, async (fixture) => {
            const result = runBootstrap(fixture, 'prepare');
            assert.notEqual(result.status, 0,
              diagnostic('prepare accepted unsafe runtime resolution state', result));
            assert.match(result.stderr, scenario.error);
            assert.equal(query(adminUrl, `
              SELECT count(*) FROM pg_roles
              WHERE rolname IN (${literal(fixture.runtimeRole)}, ${literal(fixture.migrationRole)})
            `), '0', 'Rejected prepare must roll back custom roles created in its transaction.');
          });
        });
      }
    });

    await t.test('CI database URL identity mismatches fail before role creation', async () => {
      await withFixture(adminUrl, {}, async (fixture) => {
        const wrongDatabase = runBootstrap(fixture, 'prepare', { databaseName: adminDatabase });
        assert.equal(wrongDatabase.status, 2, diagnostic('database mismatch did not fail closed', wrongDatabase));
        assert.match(wrongDatabase.stderr, /CI DATABASE_URL database does not match DATABASE_NAME/);

        const wrongLoginOnFixtureDatabase = connectionUrl({
          baseUrl: fixture.adminUrl,
          databaseName: fixture.databaseName,
          username: fixture.runtimeUser,
          password: fixture.runtimePassword,
        });
        const wrongUser = runBootstrap(fixture, 'prepare', { databaseUrl: wrongLoginOnFixtureDatabase.toString() });
        assert.equal(wrongUser.status, 2, diagnostic('user mismatch did not fail closed', wrongUser));
        assert.match(wrongUser.stderr, /CI DATABASE_URL user does not match DATABASE_MIGRATION_USER/);

        assert.equal(query(adminUrl, `
          SELECT count(*) FROM pg_roles
          WHERE rolname IN (${literal(fixture.runtimeRole)}, ${literal(fixture.migrationRole)})
        `), '0');
      });
    });
  } finally {
    if (!cloudSqlRoleExisted) execute(adminUrl, 'DROP ROLE IF EXISTS cloudsqlsuperuser');
  }
});

async function isolatedPostgresAdminUrl(t, fallbackUrl) {
  const dockerVersion = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (dockerVersion.status !== 0) return fallbackUrl;

  const suffix = `${process.pid.toString(36)}${randomBytes(4).toString('hex')}`;
  const containerName = `kdrb-pg16-${suffix}`;
  const databaseName = `kdrb_harness_${suffix}_ci`;
  const password = randomBytes(32).toString('hex');
  assertSafeDisposableDatabase(databaseName);

  const started = spawnSync('docker', [
    'run', '--detach', '--pull', 'never',
    '--name', containerName,
    '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_USER=postgres',
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', `POSTGRES_DB=${databaseName}`,
    'postgres:16',
  ], { encoding: 'utf8', timeout: 60_000 });
  if (started.status !== 0) {
    // docker may have created the named container before the client was
    // interrupted. Remove only this random, exact test container best-effort.
    spawnSync('docker', ['rm', '--force', containerName], {
      encoding: 'utf8',
      timeout: 30_000,
    });
  }
  assert.equal(started.status, 0,
    diagnostic('failed to start the isolated PostgreSQL 16 acceptance container', started));

  t.after(() => {
    const removed = spawnSync('docker', ['rm', '--force', containerName], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(removed.status, 0,
      diagnostic('failed to remove the isolated PostgreSQL acceptance container', removed));
  });

  const url = new URL('postgresql://postgres@127.0.0.1');
  url.password = password;
  url.port = isolatedPostgresPort(containerName);
  url.pathname = `/${databaseName}`;

  let ready = false;
  let lastReadiness = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    // Probe through the published loopback TCP port. The image entrypoint also
    // starts a temporary socket-only server, which is not sufficient evidence
    // that the isolated endpoint used by the test is ready.
    lastReadiness = runPsql(url, 'SELECT 1', { PGCONNECT_TIMEOUT: '1' });
    if (lastReadiness.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  assert.equal(ready, true,
    diagnostic('isolated PostgreSQL 16 did not become ready', lastReadiness ?? {}));
  Object.defineProperty(url, 'isolatedContainerName', {
    configurable: false,
    enumerable: false,
    value: containerName,
    writable: false,
  });
  return url;
}

async function restartIsolatedPostgres(fixture) {
  const { adminUrl } = fixture;
  const containerName = adminUrl.isolatedContainerName;
  if (!containerName) return null;

  const restartNotBeforeMillis = String(Date.now());
  assert.match(restartNotBeforeMillis, /^\d{13}$/);
  const restarted = spawnSync('docker', ['restart', containerName], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(restarted.status, 0,
    diagnostic('failed to restart the isolated PostgreSQL acceptance container', restarted));

  // Docker may allocate a new host port after restarting a container whose
  // loopback publication used an ephemeral host port. Re-resolve it before
  // probing readiness, then refresh every fixture URL derived before restart.
  const publishedPort = isolatedPostgresPort(containerName);
  adminUrl.port = publishedPort;
  fixture.adminDatabaseUrl.port = publishedPort;
  fixture.migrationUrl = connectionUrl({
    baseUrl: adminUrl,
    databaseName: fixture.databaseName,
    username: fixture.migrationUser,
    password: fixture.migrationPassword,
  }).toString();

  let ready = false;
  let lastReadiness = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    lastReadiness = runPsql(adminUrl, 'SELECT 1', { PGCONNECT_TIMEOUT: '1' });
    if (lastReadiness.status === 0) {
      ready = true;
      break;
    }
    await delay(250);
  }
  assert.equal(ready, true,
    diagnostic('restarted PostgreSQL acceptance container did not become ready', lastReadiness ?? {}));
  return restartNotBeforeMillis;
}

function isolatedPostgresPort(containerName) {
  const published = spawnSync('docker', ['port', containerName, '5432/tcp'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(published.status, 0,
    diagnostic('failed to resolve the isolated PostgreSQL port', published));
  const portMatch = published.stdout.trim().match(/^127\.0\.0\.1:(\d+)$/);
  assert.ok(portMatch, `ISOLATED_POSTGRES_PORT_NOT_LOOPBACK: ${published.stdout.trim()}`);
  return portMatch[1];
}

async function withFixture(adminUrl, options, work) {
  const suffix = `${process.pid.toString(36)}${randomBytes(4).toString('hex')}`;
  const fixture = {
    adminUrl,
    databaseName: `kdrb_${suffix}_ci`,
    runtimeUser: `kdrb_ru_${suffix}`,
    migrationUser: `kdrb_mu_${suffix}`,
    rogueUser: `kdrb_rogue_${suffix}`,
    rogueSchema: `kdrb_schema_${suffix}`,
    secretSchema: `kdrb_secret_${suffix}`,
    runtimeRole: options.lexicalRoleOrderProbe ? `aaa_rr_${suffix}` : `kdrb_rr_${suffix}`,
    migrationRole: options.lexicalRoleOrderProbe ? `zzz_mr_${suffix}` : `kdrb_mr_${suffix}`,
    runtimePassword: randomBytes(32).toString('hex'),
    migrationPassword: randomBytes(32).toString('hex'),
  };

  assertSafeDisposableDatabase(fixture.databaseName);

  let primaryFailure;
  try {
    execute(adminUrl, `
      CREATE ROLE ${identifier(fixture.runtimeUser)}
        LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS
        PASSWORD ${literal(fixture.runtimePassword)};
      CREATE ROLE ${identifier(fixture.migrationUser)}
        LOGIN NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS
        PASSWORD ${literal(fixture.migrationPassword)};
      GRANT cloudsqlsuperuser TO ${identifier(fixture.runtimeUser)}
        WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
      GRANT cloudsqlsuperuser TO ${identifier(fixture.migrationUser)}
        WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
    `);
    execute(adminUrl,
      `CREATE DATABASE ${identifier(fixture.databaseName)} OWNER cloudsqlsuperuser`);

    fixture.adminDatabaseUrl = connectionUrl({
      baseUrl: fixture.adminUrl,
      databaseName: fixture.databaseName,
    });

    if (options.runtimeGlobalSetting) {
      execute(adminUrl,
        `ALTER ROLE ${identifier(fixture.runtimeUser)} SET statement_timeout TO '5s'`);
    }
    if (options.runtimeUnexpectedDatabaseSetting) {
      execute(adminUrl, `
        ALTER ROLE ${identifier(fixture.runtimeUser)}
          IN DATABASE ${identifier(fixture.databaseName)}
          SET statement_timeout TO '5s'
      `);
    }
    if (options.runtimeUnexpectedOtherDatabaseSetting) {
      execute(adminUrl, `
        ALTER ROLE ${identifier(fixture.runtimeUser)}
          IN DATABASE postgres
          SET search_path TO public
      `);
    }
    if (options.runtimeNamedSchema) {
      execute(fixture.adminDatabaseUrl,
        `CREATE SCHEMA ${identifier(fixture.runtimeUser)} AUTHORIZATION cloudsqlsuperuser`);
    }

    if (options.runtimeOwnership) {
      execute(fixture.adminDatabaseUrl,
        `CREATE SCHEMA ${identifier(fixture.rogueSchema)} AUTHORIZATION ${identifier(fixture.runtimeUser)}`);
    }

    if (options.createRogueUser) {
      execute(adminUrl, `
        CREATE ROLE ${identifier(fixture.rogueUser)}
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS
      `);
    }
    if (options.unexpectedLogin) {
      execute(adminUrl, `
        CREATE ROLE ${identifier(fixture.rogueUser)}
          LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS
      `);
    }

    if (options.rogueCustomRoleGrantee
      || options.runtimeMigrationCrossMembership
      || options.transitiveLoginGrantee) {
      let unsafeMembershipSql;
      if (options.rogueCustomRoleGrantee) {
        unsafeMembershipSql = `
          CREATE ROLE ${identifier(fixture.rogueUser)}
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
          GRANT ${identifier(fixture.migrationRole)} TO ${identifier(fixture.rogueUser)}
            WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
        `;
      } else if (options.runtimeMigrationCrossMembership) {
        unsafeMembershipSql = `
          GRANT ${identifier(fixture.migrationRole)} TO ${identifier(fixture.runtimeUser)}
            WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
        `;
      } else {
        unsafeMembershipSql = `
          CREATE ROLE ${identifier(fixture.rogueUser)}
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
          GRANT ${identifier(fixture.migrationRole)} TO ${identifier(fixture.migrationUser)}
            WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
          GRANT ${identifier(fixture.migrationUser)} TO ${identifier(fixture.rogueUser)}
            WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
        `;
      }
      execute(adminUrl, `
        CREATE ROLE ${identifier(fixture.runtimeRole)}
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
        CREATE ROLE ${identifier(fixture.migrationRole)}
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
        ${unsafeMembershipSql}
      `);
    } else if (options.unsafeRuntimeRoleAttribute) {
      execute(adminUrl, `
        CREATE ROLE ${identifier(fixture.runtimeRole)}
          NOLOGIN ${unsafeAttributeClauses(options.unsafeRuntimeRoleAttribute)};
        CREATE ROLE ${identifier(fixture.migrationRole)}
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
      `);
    }
    if (options.unsafeRuntimeUserAttribute) {
      execute(adminUrl,
        `ALTER ROLE ${identifier(fixture.runtimeUser)} ${options.unsafeRuntimeUserAttribute}`);
    }

    fixture.migrationUrl = connectionUrl({
      baseUrl: fixture.adminUrl,
      databaseName: fixture.databaseName,
      username: fixture.migrationUser,
      password: fixture.migrationPassword,
    }).toString();
    fixture.systemRoleManifestSha256 = captureSystemRoleManifest(fixture);

    await work(fixture);
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    try {
      cleanupFixture(adminUrl, fixture);
    } catch (cleanupFailure) {
      if (!primaryFailure) throw cleanupFailure;
      primaryFailure.message = [
        primaryFailure.message,
        'Disposable fixture cleanup also failed:',
        cleanupFailure.message,
      ].join('\n');
    }
  }
}

function createCanonicalHardeningFixture(fixture) {
  execute(fixture.migrationUrl, `
    CREATE TABLE public.core_user_accounts (id text PRIMARY KEY);
    CREATE TABLE public.food_promo_codes (id text PRIMARY KEY);
    CREATE TABLE public.fulfillment_orders (id text PRIMARY KEY);
    CREATE SCHEMA khedmah_taxi;
    CREATE TABLE khedmah_taxi.driver_approvals (
      user_id text PRIMARY KEY,
      business_profile_id text,
      vehicle_id text,
      zone_code text,
      status text,
      reviewed_by text,
      verification_reference text,
      decision_reason text,
      approved_at timestamptz,
      expires_at timestamptz,
      revision bigint,
      updated_at timestamptz
    );
    CREATE TABLE khedmah_taxi.vehicle_approvals (
      id text PRIMARY KEY,
      driver_user_id text,
      status text,
      reviewed_by text,
      verification_reference text,
      decision_reason text,
      approved_at timestamptz,
      expires_at timestamptz,
      revision bigint,
      updated_at timestamptz
    );
    CREATE TABLE khedmah_taxi.operational_approval_events (id text PRIMARY KEY);
    CREATE FUNCTION khedmah_taxi.resolve_actor_locked(text, boolean)
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO pg_catalog, pg_temp
      AS $resolver$
      BEGIN
        RETURN true;
      END;
      $resolver$;
    REVOKE ALL ON FUNCTION khedmah_taxi.resolve_actor_locked(text, boolean) FROM PUBLIC;
  `);
}

function replaceRuntimeMembership(fixture, { runtimeInherit, runtimeAdmin }) {
  execute(fixture.adminUrl, `
    REVOKE ${identifier(fixture.runtimeRole)} FROM ${identifier(fixture.runtimeUser)};
    REVOKE ${identifier(fixture.migrationRole)} FROM ${identifier(fixture.runtimeUser)};
    REVOKE cloudsqlsuperuser FROM ${identifier(fixture.runtimeUser)};
    GRANT ${identifier(fixture.runtimeRole)} TO ${identifier(fixture.runtimeUser)}
      WITH INHERIT ${runtimeInherit ? 'TRUE' : 'FALSE'}, SET TRUE, ADMIN ${runtimeAdmin ? 'TRUE' : 'FALSE'};
    ALTER ROLE ${identifier(fixture.runtimeUser)} NOCREATEDB NOCREATEROLE;
  `);
}

function demoteMigrationMembership(fixture) {
  execute(fixture.adminUrl, `
    REVOKE ${identifier(fixture.runtimeRole)} FROM ${identifier(fixture.migrationUser)};
    REVOKE ${identifier(fixture.migrationRole)} FROM ${identifier(fixture.migrationUser)};
    REVOKE cloudsqlsuperuser FROM ${identifier(fixture.migrationUser)};
    GRANT ${identifier(fixture.migrationRole)} TO ${identifier(fixture.migrationUser)}
      WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
    ALTER ROLE ${identifier(fixture.migrationUser)} NOCREATEDB NOCREATEROLE;
  `);
}

function rotateMigrationPassword(fixture) {
  fixture.migrationPassword = randomBytes(32).toString('hex');
  execute(fixture.adminUrl, `
    ALTER ROLE ${identifier(fixture.migrationUser)} PASSWORD ${literal(fixture.migrationPassword)}
  `);
  fixture.migrationUrl = connectionUrl({
    baseUrl: fixture.adminUrl,
    databaseName: fixture.databaseName,
    username: fixture.migrationUser,
    password: fixture.migrationPassword,
  }).toString();
}

function setMigrationLoginSettings(fixture) {
  execute(fixture.migrationUrl, `
    ALTER ROLE ${identifier(fixture.migrationUser)} SET work_mem TO '4MB';
    ALTER ROLE ${identifier(fixture.migrationUser)}
      IN DATABASE ${identifier(fixture.databaseName)}
      SET lock_timeout TO '0';
    ALTER ROLE ${identifier(fixture.migrationUser)}
      IN DATABASE postgres
      SET statement_timeout TO '0'
  `);
}

function membershipQuery(fixture) {
  return `
    SELECT granted_role.rolname, member_role.rolname,
      membership.inherit_option, membership.set_option, membership.admin_option
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
    JOIN pg_roles member_role ON member_role.oid=membership.member
    WHERE member_role.rolname IN (${literal(fixture.runtimeUser)}, ${literal(fixture.migrationUser)})
    ORDER BY granted_role.rolname, member_role.rolname
  `;
}

function runtimePrivilegeSnapshotQuery(fixture) {
  return `
    SELECT
      has_schema_privilege(${literal(fixture.runtimeUser)}, 'public', 'USAGE'),
      has_schema_privilege(${literal(fixture.runtimeUser)}, 'public', 'CREATE'),
      has_schema_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi', 'USAGE'),
      has_schema_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi', 'CREATE'),
      has_column_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.driver_approvals', 'status', 'UPDATE'),
      has_column_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.driver_approvals', 'user_id', 'UPDATE'),
      has_column_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.vehicle_approvals', 'id', 'UPDATE'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.driver_approvals', 'DELETE'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.driver_approvals', 'TRUNCATE'),
      has_function_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.resolve_actor_locked(text,boolean)', 'EXECUTE')
  `;
}

function runtimePrebaselinePrivilegeQuery(fixture) {
  return `
    SELECT
      has_database_privilege(${literal(fixture.runtimeUser)}, ${literal(fixture.databaseName)}, 'CREATE'),
      has_database_privilege(${literal(fixture.runtimeUser)}, ${literal(fixture.databaseName)}, 'TEMPORARY'),
      has_schema_privilege(${literal(fixture.runtimeUser)}, 'public', 'CREATE')
  `;
}

function directRuntimeAclCountQuery(fixture) {
  return `
    SELECT
      (
        SELECT count(*)
        FROM pg_database database
        CROSS JOIN LATERAL aclexplode(database.datacl) privilege
        WHERE database.datname=${literal(fixture.databaseName)}
          AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.runtimeUser)})
      ),
      (
        SELECT count(*)
        FROM pg_namespace namespace
        CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
        WHERE namespace.nspname='public'
          AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.runtimeUser)})
      )
  `;
}

function preparedRuntimeRoleAclQuery(fixture) {
  return `
    SELECT
      count(*) FILTER (
        WHERE privilege.privilege_type='CONNECT' AND NOT privilege.is_grantable
      ),
      count(*),
      count(*) FILTER (
        WHERE privilege.privilege_type<>'CONNECT' OR privilege.is_grantable
      )
    FROM pg_database database
    CROSS JOIN LATERAL aclexplode(database.datacl) privilege
    WHERE database.datname=${literal(fixture.databaseName)}
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.runtimeRole)})
  `;
}

function directPublicSchemaCreateAclCountQuery(roleName) {
  return `
    SELECT count(*)
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
    WHERE namespace.nspname='public'
      AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname=${literal(roleName)})
      AND privilege.privilege_type='CREATE'
  `;
}

function applicationLoginSettingCountQuery(fixture) {
  return `
    SELECT
      count(*) FILTER (
        WHERE configured_role.rolname=${literal(fixture.runtimeUser)}
      ),
      count(*) FILTER (
        WHERE configured_role.rolname=${literal(fixture.migrationUser)}
      ),
      count(*)
    FROM pg_db_role_setting settings
    JOIN pg_roles configured_role ON configured_role.oid=settings.setrole
    WHERE configured_role.rolname IN (
      ${literal(fixture.runtimeUser)}, ${literal(fixture.migrationUser)}
    )
  `;
}

function canonicalPrebaselineDefaultAclQuery(fixture) {
  return `
    SELECT
      1=(SELECT count(*) FROM pg_default_acl)
      AND EXISTS (
        SELECT 1
        FROM pg_default_acl defaults
        WHERE defaults.defaclrole=(
          SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.migrationUser)}
        )
          AND defaults.defaclnamespace=0
          AND defaults.defaclobjtype='f'
          AND 1=(
            SELECT count(*)
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee=defaults.defaclrole
              AND privilege.grantor=defaults.defaclrole
              AND privilege.privilege_type='EXECUTE'
              AND NOT privilege.is_grantable
          )
          AND NOT EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee<>defaults.defaclrole
              OR privilege.grantor<>defaults.defaclrole
              OR privilege.privilege_type<>'EXECUTE'
              OR privilege.is_grantable
          )
      )
  `;
}

function canonicalHardenedDefaultAclQuery(fixture) {
  return `
    SELECT
      2=(SELECT count(*) FROM pg_default_acl)
      AND 1=(
        SELECT count(*)
        FROM pg_default_acl defaults
        WHERE defaults.defaclrole=(
          SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.migrationUser)}
        )
          AND defaults.defaclnamespace=0
          AND defaults.defaclobjtype='f'
          AND 1=(
            SELECT count(*)
            FROM aclexplode(defaults.defaclacl) privilege
          )
          AND NOT EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantor<>defaults.defaclrole
              OR privilege.grantee<>defaults.defaclrole
              OR privilege.privilege_type<>'EXECUTE'
              OR privilege.is_grantable
          )
      )
      AND 1=(
        SELECT count(*)
        FROM pg_default_acl defaults
        JOIN pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
        WHERE defaults.defaclrole=(
          SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.migrationUser)}
        )
          AND namespace.nspname='public'
          AND defaults.defaclobjtype='S'
          AND 2=(
            SELECT count(*)
            FROM aclexplode(defaults.defaclacl) privilege
          )
          AND EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee=(
              SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.runtimeRole)}
            )
              AND privilege.grantor=defaults.defaclrole
              AND privilege.privilege_type='USAGE'
              AND NOT privilege.is_grantable
          )
          AND EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee=(
              SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.runtimeRole)}
            )
              AND privilege.grantor=defaults.defaclrole
              AND privilege.privilege_type='SELECT'
              AND NOT privilege.is_grantable
          )
          AND NOT EXISTS (
            SELECT 1
            FROM aclexplode(defaults.defaclacl) privilege
            WHERE privilege.grantee<>(
              SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.runtimeRole)}
            )
              OR privilege.grantor<>defaults.defaclrole
              OR privilege.privilege_type NOT IN ('USAGE','SELECT')
              OR privilege.is_grantable
          )
      )
  `;
}

function futureRuntimePrivilegeQuery(fixture) {
  return `
    SELECT
      has_table_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard', 'SELECT'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard', 'INSERT'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard', 'UPDATE'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard', 'DELETE'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard', 'TRUNCATE'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard', 'REFERENCES'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard', 'TRIGGER'),
      has_sequence_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard_id_seq', 'USAGE'),
      has_sequence_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard_id_seq', 'SELECT'),
      has_sequence_privilege(${literal(fixture.runtimeUser)}, 'public.future_runtime_guard_id_seq', 'UPDATE'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.future_runtime_guard', 'SELECT'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.future_runtime_guard', 'INSERT'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.future_runtime_guard', 'UPDATE'),
      has_table_privilege(${literal(fixture.runtimeUser)}, 'khedmah_taxi.future_runtime_guard', 'DELETE')
  `;
}

function runtimeConnectGrantorQuery(fixture) {
  return `
    SELECT count(DISTINCT privilege.grantor)
    FROM pg_database database
    CROSS JOIN LATERAL aclexplode(database.datacl) privilege
    WHERE database.datname=${literal(fixture.databaseName)}
      AND privilege.grantee=(
        SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.runtimeRole)}
      )
      AND privilege.privilege_type='CONNECT'
      AND NOT privilege.is_grantable
  `;
}

function publicRuntimeAclCountQuery(fixture) {
  return `
    SELECT
      (
        SELECT count(*)
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        CROSS JOIN LATERAL aclexplode(relation.relacl) privilege
        WHERE namespace.nspname IN ('public','khedmah_taxi')
          AND relation.relkind IN ('r','p','v','m','f','S')
          AND privilege.grantee=0
      ),
      (
        SELECT count(*)
        FROM pg_attribute attribute
        JOIN pg_class relation ON relation.oid=attribute.attrelid
        JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
        WHERE namespace.nspname IN ('public','khedmah_taxi')
          AND attribute.attnum > 0 AND NOT attribute.attisdropped
          AND privilege.grantee=0
      ),
      (
        SELECT count(*)
        FROM pg_proc routine
        JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
        CROSS JOIN LATERAL aclexplode(
          COALESCE(routine.proacl, acldefault('f', routine.proowner))
        ) privilege
        WHERE namespace.nspname IN ('public','khedmah_taxi')
          AND privilege.grantee=0
      ),
      (
        SELECT count(*)
        FROM pg_default_acl defaults
        LEFT JOIN pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
        CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
        WHERE defaults.defaclrole=(
          SELECT oid FROM pg_roles WHERE rolname=${literal(fixture.migrationUser)}
        )
          AND defaults.defaclobjtype IN ('r','S','f')
          AND (defaults.defaclnamespace=0 OR namespace.nspname IN ('public','khedmah_taxi'))
          AND privilege.grantee=0
      )
  `;
}

function captureSystemRoleManifest(fixture) {
  const result = runBootstrap(fixture, 'inventory');
  assertBootstrapSuccess(result, 'system-role inventory');
  const manifests = [
    ...result.stdout.matchAll(/^DATABASE_SYSTEM_ROLE_MANIFEST_SHA256=([0-9a-f]{64})$/gm),
  ];
  assert.equal(manifests.length, 1,
    diagnostic('inventory did not emit exactly one trusted system-role manifest', result));
  const records = [
    ...result.stderr.matchAll(/^DATABASE_SYSTEM_ROLE_MANIFEST_RECORD=(.*)$/gm),
  ].map((match) => match[1]);
  assert.ok(records.length > 0,
    diagnostic('inventory did not emit canonical manifest records', result));
  assertDatabaseManifestRecords(fixture, records.filter((record) => record.startsWith('D|')));
  return manifests[0][1];
}

function assertDatabaseManifestRecords(fixture, databaseRecords) {
  assert.equal(databaseRecords.length, Number(query(fixture.adminUrl, 'SELECT count(*) FROM pg_database')),
    'Inventory must emit one D record for every database.');

  const recordsByName = new Map();
  for (const record of databaseRecords) {
    const fields = record.split('|');
    assert.equal(fields.length, 12, `Malformed database manifest record: ${record}`);
    assert.equal(fields[0], 'D');
    assert.match(fields[1], /^\d+$/);
    assert.match(fields[4], /^\d+$/);
    const databaseName = decodeManifestHex(fields[2]);
    assert.ok(!recordsByName.has(databaseName), `Duplicate database manifest record: ${databaseName}`);
    assert.notEqual(decodeManifestHex(fields[3]), '', 'Database owner must be recorded.');
    assert.notEqual(decodeManifestHex(fields[5]), '', 'Database collation must be recorded.');
    assert.notEqual(decodeManifestHex(fields[6]), '', 'Database character type must be recorded.');
    assert.notEqual(decodeManifestHex(fields[10]), '', 'Database tablespace must be recorded.');
    recordsByName.set(databaseName, fields);
  }

  const expectedAttributes = new Map([
    [fixture.databaseName, ['0', '1', '-1']],
    ['postgres', ['0', '1', '-1']],
    ['template0', ['1', '0', '-1']],
    ['template1', ['1', '1', '-1']],
  ]);
  for (const [databaseName, expected] of expectedAttributes) {
    const fields = recordsByName.get(databaseName);
    assert.ok(fields, `Missing database manifest record: ${databaseName}`);
    assert.deepEqual(fields.slice(7, 10), expected,
      `Unexpected template/connectivity attributes for ${databaseName}.`);
  }

  const target = recordsByName.get(fixture.databaseName);
  assert.equal(decodeManifestHex(target[3]), 'cloudsqlsuperuser');
  assert.equal(target[11], '-', 'The target ACL is audited at cutover rather than trusted by manifest.');
}

function decodeManifestHex(value) {
  assert.match(value, /^(?:[0-9a-f]{2})*$/);
  return Buffer.from(value, 'hex').toString('utf8');
}

async function openPrivilegedSession(fixture, username, password, roleName = 'cloudsqlsuperuser') {
  const applicationNamePrefix = `kdrb_live_${randomBytes(6).toString('hex')}`;
  const expectedCurrentRole = roleName ?? username;
  const applicationName = `${applicationNamePrefix}:${expectedCurrentRole}`;
  const databaseUrl = connectionUrl({
    baseUrl: fixture.adminUrl,
    databaseName: fixture.databaseName,
    username,
    password,
  });
  const environment = { ...process.env };
  for (const variable of [
    'PGDATABASE', 'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGPASSWORD',
    'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS',
  ]) delete environment[variable];

  const child = spawn('psql', [
    '-X',
    '-v', 'ON_ERROR_STOP=1',
    '-At',
    '--dbname', databaseUrl.toString(),
    '--command', `
      ${roleName === null ? '' : `SET ROLE ${identifier(roleName)};`}
      SELECT set_config(
        'application_name',
        ${literal(applicationNamePrefix)} || ':' || current_role::text,
        false
      );
      SELECT pg_sleep(300);
    `,
  ], {
    env: { ...environment, LC_ALL: 'C' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let childError;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', (error) => { childError = error; });
  const completion = new Promise((resolveCompletion) => {
    child.once('close', (code, signal) => resolveCompletion({
      code,
      status: code,
      signal,
      error: childError,
      stdout,
      stderr,
    }));
  });
  const session = { applicationName, child, completion };

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const active = runPsql(fixture.adminUrl, `
      SELECT count(*)
      FROM pg_stat_activity
      WHERE datname=${literal(fixture.databaseName)}
        AND usename=${literal(username)}
        AND application_name=${literal(applicationName)}
        AND backend_type='client backend'
    `);
    assert.equal(active.status, 0,
      diagnostic('failed to inspect the stale privileged session fixture', active));
    if (active.stdout.trim() === '1') return session;
    if (child.exitCode !== null || child.signalCode !== null || childError) {
      const outcome = await completion;
      assert.fail(diagnostic('privileged session exited before reaching SET ROLE', outcome));
    }
    await delay(50);
  }

  child.kill('SIGTERM');
  const outcome = await completion;
  assert.fail(diagnostic('timed out waiting for the stale privileged session fixture', outcome));
}

function activeSessionCountQuery(sessions) {
  assert.ok(sessions.length > 0);
  return `
    SELECT count(*)
    FROM pg_stat_activity
    WHERE application_name IN (${sessions.map((session) => literal(session.applicationName)).join(', ')})
  `;
}

async function stopPrivilegedSessions(sessions) {
  for (const session of sessions) {
    if (session.child.exitCode === null && session.child.signalCode === null) {
      session.child.kill('SIGTERM');
    }
  }
  for (const session of sessions) {
    let finished = false;
    await Promise.race([
      session.completion.then(() => { finished = true; }),
      delay(2_000),
    ]);
    if (!finished) {
      session.child.kill('SIGKILL');
      await session.completion;
    }
  }
}

async function waitForPrivilegedSessionTermination(sessions) {
  const timeout = Symbol('privileged-session-termination-timeout');
  let timeoutHandle;
  const timeoutPromise = new Promise((resolveTimeout) => {
    timeoutHandle = setTimeout(() => resolveTimeout(timeout), 10_000);
  });
  const outcome = await Promise.race([
    Promise.all(sessions.map((session) => session.completion)), timeoutPromise,
  ]).finally(() => clearTimeout(timeoutHandle));
  assert.notEqual(outcome, timeout,
    'Timed out waiting for cutover-audit to disconnect stale privileged sessions.');
  return outcome;
}

async function terminateSessionsFromAdmin(adminUrl, sessions) {
  const terminated = runPsql(adminUrl, `
    SELECT COALESCE(bool_and(pg_terminate_backend(pid, 5000)), true)
    FROM pg_stat_activity
    WHERE application_name IN (${sessions.map((session) => literal(session.applicationName)).join(', ')})
  `);
  assert.equal(terminated.status, 0,
    diagnostic('failed to terminate dedicated-server session fixtures', terminated));
  assert.equal(terminated.stdout.trim(), 't',
    diagnostic('dedicated-server session fixtures resisted termination', terminated));
  await waitForPrivilegedSessionTermination(sessions);
  await waitForNoActiveSessions(adminUrl, sessions,
    'Dedicated-server session fixtures remained active after termination.');
}

async function waitForNoActiveSessions(adminUrl, sessions, message) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (query(adminUrl, activeSessionCountQuery(sessions)) === '0') return;
    await delay(50);
  }
  assert.equal(query(adminUrl, activeSessionCountQuery(sessions)), '0', message);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function testRestartFenceMillis(adminUrl) {
  const marker = query(adminUrl, `
    SELECT (floor(extract(epoch FROM pg_postmaster_start_time()) * 1000) - 1)::bigint
  `);
  assert.match(marker, /^\d{13}$/);
  return marker;
}

function runBootstrap(fixture, phase, overrides = {}) {
  const environment = { ...process.env };
  for (const variable of ['PGDATABASE', 'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE']) {
    delete environment[variable];
  }
  delete environment.CLOUD_SQL_INSTANCE_CONNECTION_NAME;
  delete environment.DATABASE_SYSTEM_ROLE_MANIFEST_SHA256;
  delete environment.DATABASE_CUTOVER_RESTART_NOT_BEFORE_MILLIS;

  Object.assign(environment, {
    CI: 'true',
    ALLOW_DESTRUCTIVE_DB_TESTS: 'true',
    LC_ALL: 'C',
    PGOPTIONS: '-c role=cloudsqlsuperuser -c search_path=public,pg_catalog',
    DATABASE_URL: overrides.databaseUrl ?? fixture.migrationUrl,
    DATABASE_ROLE_PHASE: phase,
    DATABASE_RUNTIME_USER: fixture.runtimeUser,
    DATABASE_MIGRATION_USER: fixture.migrationUser,
    DATABASE_RUNTIME_ROLE: fixture.runtimeRole,
    DATABASE_MIGRATION_ROLE: fixture.migrationRole,
    DATABASE_NAME: overrides.databaseName ?? fixture.databaseName,
  });
  if (!['probe', 'inventory'].includes(phase)) {
    const manifest = overrides.systemRoleManifestSha256 ?? fixture.systemRoleManifestSha256;
    assert.match(manifest, /^[0-9a-f]{64}$/,
      'Every mutating or verification phase requires a trusted inventory manifest.');
    environment.DATABASE_SYSTEM_ROLE_MANIFEST_SHA256 = manifest;
  }
  if (phase === 'cutover-audit' && !overrides.omitCutoverRestartMarker) {
    environment.DATABASE_CUTOVER_RESTART_NOT_BEFORE_MILLIS =
      overrides.cutoverRestartNotBeforeMillis
      ?? fixture.cutoverRestartNotBeforeMillis
      ?? testRestartFenceMillis(fixture.adminUrl);
  }

  return spawnSync('sh', [bootstrapPath], {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

function assertBootstrapSuccess(result, operation) {
  assert.equal(result.status, 0, diagnostic(`${operation} failed`, result));
  assert.equal(result.signal, null, diagnostic(`${operation} was terminated`, result));
}

function assertBootstrapRejected(result, expectedStatus, scenario) {
  assert.equal(result.status, expectedStatus, diagnostic(`${scenario} was not rejected with exit ${expectedStatus}`, result));
  assert.match(result.stderr, /DATABASE_ROLE_ISOLATION_NOT_READY/);
}

function cleanupFixture(adminUrl, fixture) {
  const terminate = runPsql(adminUrl, `
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname=${literal(fixture.databaseName)} AND pid <> pg_backend_pid()
  `);
  assert.equal(terminate.status, 0, diagnostic('failed to terminate disposable fixture connections', terminate));

  const dropDatabase = runPsql(adminUrl,
    `DROP DATABASE IF EXISTS ${identifier(fixture.databaseName)} WITH (FORCE)`);
  assert.equal(dropDatabase.status, 0, diagnostic('failed to drop disposable fixture database', dropDatabase));

  const dropRoles = runPsql(adminUrl, `
    DROP ROLE IF EXISTS
      ${identifier(fixture.runtimeUser)},
      ${identifier(fixture.migrationUser)},
      ${identifier(fixture.rogueUser)},
      ${identifier(fixture.runtimeRole)},
      ${identifier(fixture.migrationRole)}
  `);
  assert.equal(dropRoles.status, 0, diagnostic('failed to drop disposable fixture roles', dropRoles));

  assert.equal(query(adminUrl, `
    SELECT
      EXISTS (SELECT 1 FROM pg_database WHERE datname=${literal(fixture.databaseName)}),
      count(*)
    FROM pg_roles
    WHERE rolname IN (
      ${literal(fixture.runtimeUser)}, ${literal(fixture.migrationUser)}, ${literal(fixture.rogueUser)},
      ${literal(fixture.runtimeRole)}, ${literal(fixture.migrationRole)}
    )
  `), 'f|0', 'Disposable PostgreSQL fixture cleanup left database or role state behind.');
}

function unsafeAttributeClauses(attribute) {
  const attributes = {
    SUPERUSER: 'SUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS',
    REPLICATION: 'NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT REPLICATION NOBYPASSRLS',
    BYPASSRLS: 'NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION BYPASSRLS',
  };
  assert.ok(attributes[attribute], `Unsupported unsafe role attribute: ${attribute}`);
  return attributes[attribute];
}

function execute(databaseUrl, sql, environment = {}) {
  const result = runPsql(databaseUrl, sql, environment);
  assert.equal(result.status, 0, diagnostic('PostgreSQL command failed', result));
  return result.stdout.trim();
}

function query(databaseUrl, sql, environment = {}) {
  return execute(databaseUrl, sql, environment);
}

function runPsql(databaseUrl, sql, environment = {}) {
  const cleanEnvironment = { ...process.env };
  for (const variable of [
    'PGDATABASE', 'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGPASSWORD',
    'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS',
  ]) delete cleanEnvironment[variable];

  return spawnSync('psql', [
    '-X',
    '-v', 'ON_ERROR_STOP=1',
    '-At',
    '--dbname', databaseUrl.toString(),
    '--command', sql,
  ], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...cleanEnvironment, LC_ALL: 'C', ...environment },
  });
}

function connectionUrl({ baseUrl, databaseName, username, password } = {}) {
  const url = baseUrl
    ? new URL(baseUrl)
    : process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL)
    : new URL('postgresql://localhost');

  if (!baseUrl && !process.env.DATABASE_URL) {
    url.hostname = process.env.PGHOST ?? '127.0.0.1';
    url.port = process.env.PGPORT ?? '5432';
    url.username = process.env.PGUSER ?? '';
    url.password = process.env.PGPASSWORD ?? '';
    url.pathname = `/${process.env.PGDATABASE ?? ''}`;
  }

  if (databaseName !== undefined) url.pathname = `/${databaseName}`;
  if (username !== undefined) url.username = username;
  if (password !== undefined) url.password = password;
  return url;
}

function assertSafeDisposableDatabase(databaseName) {
  const normalized = databaseName.toLowerCase();
  assert.ok(safeDisposableDatabase.test(normalized) && !forbiddenDatabases.has(normalized),
    `UNSAFE_DESTRUCTIVE_DATABASE_TARGET: ${normalized || '<missing>'}`);
}

function assertCommandAvailable(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, diagnostic(`required command is unavailable: ${command}`, result));
}

function identifier(value) {
  assert.match(value, /^[a-z_][a-z0-9_]*$/);
  return `"${value}"`;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function diagnostic(message, result) {
  return [message, result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n');
}
