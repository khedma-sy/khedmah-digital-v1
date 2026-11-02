import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const inspector = readFileSync(new URL('../scripts/read-preview-v2-instance-metric-evidence.py', import.meta.url), 'utf8');

test('Preview V2 Monitoring reader cannot authorize writer quiescence by itself', () => {
  assert.match(inspector, /"writer_quiescence_verified": False/);
  assert.match(inspector, /"database_checked": False/);
  assert.match(inspector, /"release_authorized": False/);
  assert.match(inspector, /"cloud_mutation_performed": False/);
  assert.match(inspector, /"instance_zero_point_observed_after_boundary"/);
  assert.doesNotMatch(inspector, /"writer_quiescence_verified": bool\(/);
});

test('Preview V2 Monitoring offline Python regressions run in the canonical CI test suite', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, [
    '-m', 'unittest', 'discover', '-s', 'tests',
    '-p', 'test_read_preview_v2_instance_metric_evidence.py',
  ], { cwd: root, encoding: 'utf8', timeout: 20000 });

  assert.equal(result.error, undefined, result.error?.message ?? result.stderr);
  assert.equal(result.status, 0, [result.stdout, result.stderr].join('\n'));
});
