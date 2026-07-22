import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBackendApp } from './app';

test('GET /api/v1/health returns platform health only', async () => {
  const app = await createBackendApp();
  await app.listen(0);

  try {
    const server = app.getHttpServer();
    const address = server.address();
    assert.equal(typeof address, 'object');
    assert.notEqual(address, null);

    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['status', 'timestamp', 'version']);
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.timestamp, 'string');
    assert.equal(typeof body.version, 'string');
  } finally {
    await app.close();
  }
});
