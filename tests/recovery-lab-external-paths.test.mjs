import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('recovery-lab external path inspection is read-only and reports unknowns', () => {
  const result = spawnSync('python3',
    ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_inspect_recovery_lab_external_paths.py'],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'offline inspection tests failed');
});
