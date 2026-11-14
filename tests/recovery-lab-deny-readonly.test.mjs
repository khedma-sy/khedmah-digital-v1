import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('lab-only IAM deny policy inventory stays read-only and NO-GO', () => {
  const result = spawnSync('python3',
    ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_recovery_lab_deny_readonly.py'],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
      env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: '1' } });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'IAM deny offline tests failed');
});
