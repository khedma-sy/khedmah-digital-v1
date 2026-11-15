import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('private lab catalog probe never targets source and requires read-only identity', () => {
  const p = spawnSync('python3', ['-m','unittest','discover','-s','tests','-p','test_recovery_lab_catalog_probe.py'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
    env: {...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: '1'}
  });
  assert.equal(p.status, 0, p.stderr || p.stdout || 'lab catalog probe safety tests failed');
});
