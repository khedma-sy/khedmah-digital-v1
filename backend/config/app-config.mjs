import { createEnvironmentContext } from './environment.mjs';
import { validateRequiredFields } from '../core/validation/validators.mjs';

const DEFAULT_APP_NAME = 'Khedmah Digital V1 Backend';
const DEFAULT_REQUEST_ID_HEADER = 'x-request-id';
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_PORT = 3000;
const MIN_PORT = 1;
const MAX_PORT = 65535;

const allowedLogLevels = new Set(['debug', 'info', 'warn', 'error']);

function parsePort(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_PORT), 10);
  if (Number.isNaN(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
    return DEFAULT_PORT;
  }
  return parsed;
}

function normalizeLogLevel(value) {
  const normalized = String(value || DEFAULT_LOG_LEVEL).trim().toLowerCase();
  return allowedLogLevels.has(normalized) ? normalized : DEFAULT_LOG_LEVEL;
}

export function createApplicationConfig(source = {}) {
  const environmentContext = createEnvironmentContext(source);
  const config = {
    appName: String(source.APP_NAME || DEFAULT_APP_NAME),
    environment: environmentContext.environment,
    port: parsePort(source.PORT),
    logLevel: normalizeLogLevel(source.LOG_LEVEL),
    requestIdHeader: String(source.REQUEST_ID_HEADER || DEFAULT_REQUEST_ID_HEADER).toLowerCase(),
  };

  const validation = validateApplicationConfig(config);

  return Object.freeze({
    ...config,
    environmentContext,
    validation,
  });
}

export function validateApplicationConfig(config) {
  const required = validateRequiredFields(config, ['appName', 'environment', 'port', 'logLevel', 'requestIdHeader']);
  const issues = [...required.errors];

  if (typeof config.port !== 'number' || config.port < MIN_PORT || config.port > MAX_PORT) {
    issues.push({ field: 'port', code: 'INVALID_VALUE', message: 'Port must be a valid TCP port number.' });
  }

  if (!allowedLogLevels.has(config.logLevel)) {
    issues.push({ field: 'logLevel', code: 'INVALID_VALUE', message: 'Log level must be debug, info, warn, or error.' });
  }

  return Object.freeze({
    valid: issues.length === 0,
    errors: Object.freeze(issues),
  });
}

export const configDefaults = Object.freeze({
  appName: DEFAULT_APP_NAME,
  requestIdHeader: DEFAULT_REQUEST_ID_HEADER,
  logLevel: DEFAULT_LOG_LEVEL,
  port: DEFAULT_PORT,
});
