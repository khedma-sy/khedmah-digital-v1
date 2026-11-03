import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Preview V2 disabled-service alternative remains fail closed under regressions', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, [
    '-m', 'unittest', 'discover', '-s', 'tests',
    '-p', 'test_assess_preview_v2_stable_manual_zero.py',
  ], { cwd: root, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined, result.error?.message ?? result.stderr);
  assert.equal(result.status, 0, [result.stdout, result.stderr].join('\n'));
});
