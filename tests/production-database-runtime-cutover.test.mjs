import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

test('Phase B cutover guards approval, backup, operation boundaries and fresh-session evidence', () => {
  const result = spawnSync('python3', [resolve(import.meta.dirname, 'production-database-runtime-cutover.test.py')], {
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
