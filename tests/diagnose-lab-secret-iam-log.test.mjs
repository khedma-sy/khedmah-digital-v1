import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('local lab IAM failure diagnosis stays scoped and does not disclose logs', () => {
  const result = spawnSync('python3', [
    '-m', 'unittest', 'discover', '-s', 'tests',
    '-p', 'test_diagnose_lab_secret_iam_log.py',
  ], { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'log diagnosis tests failed');
});
