import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPlatformConfig } from './platform-config';

test('platform config uses safe defaults for unsupported environment values', () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalPort = process.env.PORT;
  const originalVersion = process.env.APP_VERSION;

  process.env.NODE_ENV = 'unsafe-value';
  process.env.PORT = 'not-a-port';
  process.env.APP_VERSION = '';

  try {
    const config = loadPlatformConfig();

    assert.equal(config.environment, 'development');
    assert.equal(config.port, 3001);
    assert.equal(config.version, '0.1.0');
    assert.equal(config.serviceName, 'khedmah-digital-v1-backend');
  } finally {
    process.env.NODE_ENV = originalEnvironment;
    process.env.PORT = originalPort;
    process.env.APP_VERSION = originalVersion;
  }
});
