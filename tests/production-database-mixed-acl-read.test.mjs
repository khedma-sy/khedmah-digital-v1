import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

test('Phase A readback stays read-only and rejects partial, malformed or drifting evidence', () => {
  const result = spawnSync('python3', [resolve(import.meta.dirname, 'production-database-mixed-acl-read.test.py')], {
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
