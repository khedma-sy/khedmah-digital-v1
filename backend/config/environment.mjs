export const EnvironmentName = Object.freeze({
  DEVELOPMENT: 'development',
  TESTING: 'testing',
  STAGING: 'staging',
  PRODUCTION: 'production',
});

const allowedEnvironments = new Set(Object.values(EnvironmentName));

export function normalizeEnvironment(value) {
  const normalized = String(value || EnvironmentName.DEVELOPMENT).trim().toLowerCase();
  return allowedEnvironments.has(normalized) ? normalized : EnvironmentName.DEVELOPMENT;
}

export function isProductionEnvironment(environment) {
  return normalizeEnvironment(environment) === EnvironmentName.PRODUCTION;
}

export function createEnvironmentContext(source = {}) {
  const environment = normalizeEnvironment(source.NODE_ENV || source.APP_ENV);

  return Object.freeze({
    environment,
    isDevelopment: environment === EnvironmentName.DEVELOPMENT,
    isTesting: environment === EnvironmentName.TESTING,
    isStaging: environment === EnvironmentName.STAGING,
    isProduction: environment === EnvironmentName.PRODUCTION,
  });
}
