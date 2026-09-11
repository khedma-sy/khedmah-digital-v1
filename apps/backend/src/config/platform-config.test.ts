import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadPlatformConfig } from './platform-config';

const originalEnvironment = process.env.NODE_ENV;
const originalPort = process.env.PORT;
const originalVersion = process.env.APP_VERSION;

afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment;
  if (originalPort === undefined) delete process.env.PORT;
  else process.env.PORT = originalPort;
  if (originalVersion === undefined) delete process.env.APP_VERSION;
  else process.env.APP_VERSION = originalVersion;
});

test('platform config uses safe defaults for unsupported environment values', () => {
  process.env.NODE_ENV = 'unsafe-value';
  process.env.PORT = 'not-a-port';
  process.env.APP_VERSION = '';

  const config = loadPlatformConfig();

  assert.equal(config.environment, 'development');
  assert.equal(config.port, 3001);
  assert.equal(config.version, '0.1.0');
  assert.equal(config.serviceName, 'khedmah-digital-v1-backend');
});

test('platform config preserves preview as an isolated runtime environment', () => {
  process.env.NODE_ENV = 'preview';
  process.env.PORT = '8080';
  process.env.APP_VERSION = 'preview-fixture';

  const config = loadPlatformConfig();

  assert.equal(config.environment, 'preview');
  assert.equal(config.port, 8080);
  assert.equal(config.version, 'preview-fixture');
});
