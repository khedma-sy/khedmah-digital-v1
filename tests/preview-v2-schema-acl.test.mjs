import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Preview schema ACL inspection is read only, complete and private', () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests',
    '-p', 'test_preview_v2_schema_acl.py', '-v'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    timeout: 120000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
