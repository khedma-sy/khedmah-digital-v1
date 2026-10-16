import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Preview runtime reconciliation and login verification never mutate', () => {
  const result=spawnSync('python3',[fileURLToPath(new URL('./test_preview_v2_runtime_verify.py',import.meta.url))],{encoding:'utf8'});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
});
