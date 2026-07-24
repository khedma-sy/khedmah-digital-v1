import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { createDatabaseConfig, validateDatabaseConfigSafety } from '../backend/database/config/database-config.mjs';
import { DatabaseEnvironment, databaseEnvironmentDefaults, isDatabaseEnvironment } from '../backend/database/config/environments.mjs';
import { createDatabaseConnectionDescriptor, DatabaseAdapter, DatabaseConnectionState } from '../backend/database/connection/connection-foundation.mjs';
import { createDatabaseError, DatabaseErrorCode } from '../backend/database/errors/database-errors.mjs';
import { assertNoBusinessTableDefinitions, DatabaseLayerBoundary, ForbiddenDatabaseTableScope } from '../backend/database/schema/schema-foundation.mjs';
import { assertDatabaseFoundationTestScope, createTestingDatabaseConfig } from '../backend/database/testing/database-test-helpers.mjs';
import { createMigrationExecutionPlan, MigrationSafetyRule, MIGRATION_NAME_PATTERN, MIGRATION_VERSION_PATTERN, validateMigrationName } from '../backend/migrations/framework/migration-foundation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('database foundation folder structure is approved for Mission 066', async () => {
  const databaseEntries = await readdir(new URL('../backend/database/', import.meta.url), { withFileTypes: true });
  const databaseDirectories = databaseEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(databaseDirectories, ['config', 'connection', 'errors', 'schema', 'testing']);

  const migrationEntries = await readdir(new URL('../backend/migrations/', import.meta.url), { withFileTypes: true });
  const migrationDirectories = migrationEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(migrationDirectories, ['framework', 'versions']);
});

test('database configuration supports environment separation without secrets', () => {
  for (const environment of Object.values(DatabaseEnvironment)) {
    assert.equal(isDatabaseEnvironment(environment), true);
    const result = createDatabaseConfig({ environment });
    assert.equal(result.valid, true);
    assert.equal(result.config.environment, environment);
    assert.equal(result.config.storesConnectionString, false);
    assert.equal(result.config.storesCredentials, false);
    assert.equal(result.config.storesProductionValues, false);
    assert.equal(result.config.seedDataAllowed, false);
  }
  assert.equal(databaseEnvironmentDefaults.production.migrationsEnabled, false);
  assert.equal(validateDatabaseConfigSafety({ databaseUrl: 'never', password: 'never', token: 'never' }).valid, false);
});

test('connection foundation creates descriptors only and opens no production connection', () => {
  const { config } = createDatabaseConfig({ environment: DatabaseEnvironment.DEVELOPMENT });
  const descriptor = createDatabaseConnectionDescriptor(config);
  assert.equal(descriptor.adapter, DatabaseAdapter.POSTGRESQL);
  assert.equal(descriptor.state, DatabaseConnectionState.READY_FOR_FUTURE_CONNECTION);
  assert.equal(descriptor.opensNetworkConnection, false);
  assert.equal(descriptor.includesCredentials, false);
  assert.equal(descriptor.includesConnectionString, false);
});

test('migration naming versioning execution and rollback compatibility are enforced', () => {
  assert.match('001_database_foundation.sql', MIGRATION_NAME_PATTERN);
  assert.match('066', MIGRATION_VERSION_PATTERN);
  assert.equal(validateMigrationName('001_database_foundation.sql').valid, true);
  assert.equal(validateMigrationName('1_bad.sql').valid, false);
  const plan = createMigrationExecutionPlan({ migrationName: '001_database_foundation.sql', rollbackName: '001_database_foundation_rollback.sql' });
  assert.equal(plan.valid, true);
  assert.equal(plan.executesSql, false);
  assert.equal(plan.createsBusinessTables, false);
  assert.equal(MigrationSafetyRule.requiresRollbackPlan, true);
  assert.equal(MigrationSafetyRule.allowsBusinessTablesInPhaseOne, false);
  assert.equal(MigrationSafetyRule.executesAutomaticallyInProduction, false);
});

test('database errors use Mission 052 core errors without exposing internals', () => {
  for (const code of Object.values(DatabaseErrorCode)) {
    const error = createDatabaseError(code);
    assert.ok(error instanceof KhedmahCoreError);
    assert.equal(error.category, ErrorCategory.SYSTEM);
    assert.equal(error.metadata.internalDetailsExposed, false);
  }
});

test('database testing helpers stay foundation-only and avoid business entities', () => {
  const result = createTestingDatabaseConfig();
  assert.equal(result.valid, true);
  assert.equal(result.config.environment, DatabaseEnvironment.TESTING);
  assert.equal(assertDatabaseFoundationTestScope({}).valid, true);
  assert.equal(assertDatabaseFoundationTestScope({ testsBusinessEntities: true }).valid, false);
  assert.equal(assertDatabaseFoundationTestScope({ opensDatabaseConnection: true }).valid, false);
  assert.equal(assertDatabaseFoundationTestScope({ usesProductionValues: true }).valid, false);
});

test('architecture compliance keeps database below repository domain application and API layers', () => {
  assert.equal(DatabaseLayerBoundary.BELOW_REPOSITORY_LAYER, true);
  assert.equal(DatabaseLayerBoundary.BELOW_DOMAIN_LAYER, true);
  assert.equal(DatabaseLayerBoundary.BELOW_APPLICATION_LAYER, true);
  assert.equal(DatabaseLayerBoundary.BELOW_API_LAYER, true);
  assert.equal(DatabaseLayerBoundary.API_DIRECT_DATABASE_ACCESS_ALLOWED, false);
  assert.equal(DatabaseLayerBoundary.BUSINESS_LOGIC_IN_DATABASE_LAYER_ALLOWED, false);
});

test('security boundaries prevent stored credentials tokens database URLs and private data', async () => {
  const files = [
    'backend/database/README.md',
    'backend/database/config/environments.mjs',
    'backend/database/config/database-config.mjs',
    'backend/database/connection/connection-foundation.mjs',
    'backend/database/errors/database-errors.mjs',
    'backend/database/testing/database-test-helpers.mjs',
    'backend/migrations/README.md',
    'backend/migrations/framework/migration-foundation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /postgres:\/\/|mysql:\/\/|DATABASE_URL\s*=|password\s*=|token\s*=|secret\s*=|credential\s*=/i);
});

test('KILL CRITICAL review confirms forbidden tables are not created', async () => {
  assert.equal(ForbiddenDatabaseTableScope.MARKETPLACE_TABLES, 'marketplace_tables');
  assert.equal(ForbiddenDatabaseTableScope.PAYMENT_TABLES, 'payment_tables');
  assert.equal(ForbiddenDatabaseTableScope.ORDER_TABLES, 'order_tables');
  assert.equal(ForbiddenDatabaseTableScope.COMMISSION_TABLES, 'commission_tables');
  assert.equal(ForbiddenDatabaseTableScope.ADVERTISING_TABLES, 'advertising_tables');
  assert.equal(ForbiddenDatabaseTableScope.RANKING_TABLES, 'ranking_tables');
  assert.equal(ForbiddenDatabaseTableScope.SOCIAL_GRAPH_TABLES, 'social_graph_tables');
  assert.equal(ForbiddenDatabaseTableScope.TRACKING_TABLES, 'tracking_tables');
  assert.equal(assertNoBusinessTableDefinitions('database foundation only').valid, true);
  assert.equal(assertNoBusinessTableDefinitions('CREATE TABLE users (id text)').valid, false);

  const files = [
    'backend/database/README.md',
    'backend/migrations/README.md',
    'backend/migrations/framework/migration-foundation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /CREATE\s+TABLE\s+(users|profiles|organizations|services|marketplace|payments|orders|commissions|advertising|ranking|social|tracking)/i);
});
