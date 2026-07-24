export const DatabaseEnvironment = Object.freeze({
  DEVELOPMENT: 'development',
  TESTING: 'testing',
  STAGING: 'staging',
  PRODUCTION: 'production',
});

export const databaseEnvironmentDefaults = Object.freeze({
  [DatabaseEnvironment.DEVELOPMENT]: Object.freeze({ adapter: 'postgresql', sslMode: 'prefer', migrationsEnabled: true, seedDataAllowed: false }),
  [DatabaseEnvironment.TESTING]: Object.freeze({ adapter: 'postgresql', sslMode: 'disable', migrationsEnabled: true, seedDataAllowed: false }),
  [DatabaseEnvironment.STAGING]: Object.freeze({ adapter: 'postgresql', sslMode: 'require', migrationsEnabled: true, seedDataAllowed: false }),
  [DatabaseEnvironment.PRODUCTION]: Object.freeze({ adapter: 'postgresql', sslMode: 'require', migrationsEnabled: false, seedDataAllowed: false }),
});

export function isDatabaseEnvironment(value) {
  return Object.values(DatabaseEnvironment).includes(value);
}
