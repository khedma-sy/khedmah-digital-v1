import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
test('Operations Product repository readiness gate has no local failures', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-operations-readiness.mjs'], { encoding: 'utf8' });
  const report = JSON.parse(output);
  assert.equal(report.mode, 'repository');
  assert.equal(report.summary.fail ?? 0, 0);
  assert.ok(report.summary.pass >= 40);
});
test('Operations Product production gate fails closed without injected production evidence', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/validate-operations-readiness.mjs', '--production'], { encoding: 'utf8', env: {} }));
});

test('live certification execution refuses an unapproved environment', () => {
  assert.throws(() => execFileSync('bash', ['scripts/run-live-production-certification.sh'], { encoding: 'utf8', env: {} }));
});
test('live evidence collection refuses missing tooling and production inputs', () => {
  assert.throws(() => execFileSync('bash', ['scripts/collect-live-production-evidence.sh', '/tmp/khedmah-live-evidence-test'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }));
});
