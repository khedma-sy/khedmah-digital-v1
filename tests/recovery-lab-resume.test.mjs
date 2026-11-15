import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('recovery lab resume confines restart and transition to the authorized target', () => {
  const result = spawnSync('python3',
    ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_resume_recovery_lab_transition.py'],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'offline lab guard tests failed');
});
