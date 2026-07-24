import { DatabaseEnvironment, databaseEnvironmentDefaults, isDatabaseEnvironment } from './environments.mjs';

const forbiddenConfigKeys = Object.freeze(['password', 'token', 'secret', 'credential', 'databaseUrl', 'connectionString', 'privateKey']);

export function validateDatabaseConfigSafety(value = {}) {
  const exposed = Object.keys(value).filter((key) => forbiddenConfigKeys.some((field) => key.toLowerCase().includes(field.toLowerCase())));
  return Object.freeze({ valid: exposed.length === 0, exposed: Object.freeze(exposed), errors: Object.freeze(exposed.map((field) => ({ field, code: 'DATABASE_CONFIG_SECRET_FORBIDDEN', message: `${field} must not be stored in database foundation configuration.` }))) });
}

export function createDatabaseConfig({ environment = DatabaseEnvironment.DEVELOPMENT, schema = 'public', adapter } = {}) {
  const selectedEnvironment = isDatabaseEnvironment(environment) ? environment : DatabaseEnvironment.DEVELOPMENT;
  const defaults = databaseEnvironmentDefaults[selectedEnvironment];
  const config = Object.freeze({
    environment: selectedEnvironment,
    adapter: adapter || defaults.adapter,
    schema,
    sslMode: defaults.sslMode,
    migrationsEnabled: defaults.migrationsEnabled,
    seedDataAllowed: defaults.seedDataAllowed,
    usesEnvironmentProvidedConnection: true,
    storesConnectionString: false,
    storesCredentials: false,
    storesProductionValues: false,
  });
  return Object.freeze({ valid: true, config, errors: Object.freeze([]) });
}
