import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApplicationConfig, configDefaults } from '../backend/config/app-config.mjs';
import { createEnvironmentContext, EnvironmentName, normalizeEnvironment } from '../backend/config/environment.mjs';
import { ErrorCategory, KhedmahCoreError, createValidationError } from '../backend/core/errors/base-error.mjs';
import { LogLevel, createLogEntry, createMemoryLogger, redactSensitiveMetadata } from '../backend/core/logging/logger.mjs';
import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../backend/core/validation/validators.mjs';
import { LifecycleStatus, Visibility, createPaginatedResult, createResult } from '../backend/shared/common-types.mjs';

test('environment handling supports approved environments and safe defaults', () => {
  assert.equal(normalizeEnvironment('development'), EnvironmentName.DEVELOPMENT);
  assert.equal(normalizeEnvironment('testing'), EnvironmentName.TESTING);
  assert.equal(normalizeEnvironment('staging'), EnvironmentName.STAGING);
  assert.equal(normalizeEnvironment('production'), EnvironmentName.PRODUCTION);
  assert.equal(normalizeEnvironment('unexpected'), EnvironmentName.DEVELOPMENT);

  const context = createEnvironmentContext({ NODE_ENV: 'testing' });
  assert.equal(context.environment, 'testing');
  assert.equal(context.isTesting, true);
  assert.equal(context.isProduction, false);
});

test('application configuration uses safe defaults and validates values', () => {
  const config = createApplicationConfig({ NODE_ENV: 'testing', PORT: 'not-a-port', LOG_LEVEL: 'unknown' });

  assert.equal(config.appName, configDefaults.appName);
  assert.equal(config.port, configDefaults.port);
  assert.equal(config.logLevel, configDefaults.logLevel);
  assert.equal(config.requestIdHeader, configDefaults.requestIdHeader);
  assert.equal(config.environment, 'testing');
  assert.equal(config.validation.valid, true);
});

test('base errors expose code message category and metadata without API responses', () => {
  const error = new KhedmahCoreError({
    code: 'CORE_TEST_ERROR',
    message: 'Core test error.',
    category: ErrorCategory.SYSTEM,
    metadata: { requestId: 'req-1' },
  });

  assert.equal(error.code, 'CORE_TEST_ERROR');
  assert.equal(error.message, 'Core test error.');
  assert.equal(error.category, ErrorCategory.SYSTEM);
  assert.deepEqual(error.toJSON(), {
    code: 'CORE_TEST_ERROR',
    message: 'Core test error.',
    category: ErrorCategory.SYSTEM,
    metadata: { requestId: 'req-1' },
  });

  const validationError = createValidationError('Invalid foundation value.', { field: 'name' });
  assert.equal(validationError.category, ErrorCategory.VALIDATION);
});

test('logging foundation creates structured entries and redacts sensitive metadata', () => {
  const redacted = redactSensitiveMetadata({
    requestId: 'req-1',
    password: 'hidden',
    accessToken: 'hidden',
    apiSecret: 'hidden',
    credentialName: 'hidden',
  });

  assert.equal(redacted.requestId, 'req-1');
  assert.equal(redacted.password, '[REDACTED]');
  assert.equal(redacted.accessToken, '[REDACTED]');
  assert.equal(redacted.apiSecret, '[REDACTED]');
  assert.equal(redacted.credentialName, '[REDACTED]');

  const entry = createLogEntry({ level: LogLevel.WARN, message: 'Safe warning.', requestId: 'req-2', metadata: redacted });
  assert.equal(entry.level, LogLevel.WARN);
  assert.equal(entry.requestId, 'req-2');

  const logger = createMemoryLogger({ level: LogLevel.WARN });
  assert.equal(logger.info('below threshold'), undefined);
  assert.equal(logger.warn('visible', { requestId: 'req-3' })?.level, LogLevel.WARN);
  assert.equal(logger.entries().length, 1);
});

test('validation foundation supports required fields formats values and composition', () => {
  const required = validateRequiredFields({ name: 'Khedmah' }, ['name', 'category']);
  assert.equal(required.valid, false);
  assert.equal(required.errors[0].code, 'REQUIRED_FIELD');

  const allowed = validateAllowedValue('environment', 'testing', ['development', 'testing']);
  assert.equal(allowed.valid, true);

  const format = validatePattern('slug', 'valid-slug', /^[a-z-]+$/);
  assert.equal(format.valid, true);

  const combined = combineValidationResults(required, allowed, format);
  assert.equal(combined.valid, false);
  assert.equal(combined.errors.length, 1);
});

test('shared common types remain technical and generic', () => {
  assert.equal(Visibility.PUBLIC, 'public');
  assert.equal(Visibility.PRIVATE, 'private');
  assert.equal(Visibility.INTERNAL, 'internal');
  assert.equal(LifecycleStatus.CREATED, 'created');
  assert.equal(LifecycleStatus.ARCHIVED, 'archived');

  const result = createResult({ ok: true, value: { id: 'safe' } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { id: 'safe' });

  const paginated = createPaginatedResult({ items: ['a', 'b'], page: 2, pageSize: 2, total: 5 });
  assert.deepEqual(paginated, { items: ['a', 'b'], page: 2, pageSize: 2, total: 5 });
});

test('core infrastructure does not expose production or private values', () => {
  const config = createApplicationConfig({});
  const entry = createLogEntry({ message: 'Safe entry.', metadata: { privateUserInformation: 'hidden' } });

  assert.doesNotMatch(JSON.stringify(config), /password|credential|token|secret|production-url/i);
  assert.equal(entry.metadata.privateUserInformation, '[REDACTED]');
});
