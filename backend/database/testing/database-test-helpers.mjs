import { createDatabaseConfig } from '../config/database-config.mjs';
import { DatabaseEnvironment } from '../config/environments.mjs';

export function createTestingDatabaseConfig(overrides = {}) {
  return createDatabaseConfig({ environment: DatabaseEnvironment.TESTING, schema: 'test_foundation', ...overrides });
}

export function assertDatabaseFoundationTestScope(value = {}) {
  const valid = value.testsBusinessEntities !== true && value.opensDatabaseConnection !== true && value.usesProductionValues !== true;
  return Object.freeze({ valid, testsBusinessEntities: value.testsBusinessEntities === true, opensDatabaseConnection: value.opensDatabaseConnection === true, usesProductionValues: value.usesProductionValues === true });
}
