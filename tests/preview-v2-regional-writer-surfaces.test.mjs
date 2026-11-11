import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Preview V2 regional writer surfaces are read-only and never certify quiescence', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, [
    '-m', 'unittest', 'discover', '-s', 'tests',
    '-p', 'test_preview_v2_regional_writer_surfaces.py',
  ], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.error, undefined, result.error?.message ?? result.stderr);
  assert.equal(result.status, 0, [result.stdout, result.stderr].join('\n'));
});
