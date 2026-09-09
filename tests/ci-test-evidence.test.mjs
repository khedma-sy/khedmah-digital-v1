import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/test-and-verify.yml', import.meta.url), 'utf8');
const step = workflow.split('      - name: ✅ Run all tests\n')[1].split('\n      - name:')[0];
const command = step.match(/        run: \|\n([\s\S]*?)\n        env:/)[1]
  .split('\n').map(line => line.slice(10)).join('\n');

for (const exitCode of [0, 1, 7]) {
  test(`test evidence preserves the test runner exit code ${exitCode}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'khedmah-ci-evidence-'));
    try {
      const bin = join(dir, 'bin');
      await mkdir(bin);
      await writeFile(join(bin, 'npm'), `#!/bin/sh\nprintf '%s\\n' 'retained stdout' >&1\nprintf '%s\\n' 'retained stderr' >&2\nexit ${exitCode}\n`, { mode: 0o755 });
      const run = spawnSync('bash', ['-c', command], {
        env: { ...process.env, RUNNER_TEMP: dir, PATH: `${bin}:${process.env.PATH}` },
        encoding: 'utf8', timeout: 10000
      });
      assert.equal(run.error, undefined);
      assert.equal(run.status, exitCode, run.stderr);
      const log = await readFile(join(dir, 'khedmah-test-evidence/test-all.log'), 'utf8');
      assert.match(log, /retained stdout/);
      assert.match(log, /retained stderr/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test('evidence is retained after failure without weakening the original gates', () => {
  assert.match(workflow, /name: Preserve test evidence\n        if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /name: Upload test evidence\n        if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /NOT_EXECUTED: no test log was produced/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/);
  assert.doesNotMatch(step, /continue-on-error|\|\|\s*true|\|\|\s*echo/);
  assert.match(workflow, /git archive --format=tar\.gz HEAD/);
  assert.match(workflow, /':!\*\*\/\.env\*'/);
  assert.match(workflow, /retention-days: 7/);
});

test('diagnostic archive tolerates absent optional documents and excludes runtime files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'khedmah-ci-source-'));
  const run = (tool, args, env = {}) => {
    const result = spawnSync(tool, args, { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    await mkdir(join(dir, 'apps'));
    await writeFile(join(dir, 'apps/source.ts'), 'export const fixture = true;\n');
    await writeFile(join(dir, '.env'), 'synthetic excluded root fixture');
    await writeFile(join(dir, '.env.production'), 'synthetic excluded root fixture');
    await writeFile(join(dir, 'root.key'), 'synthetic excluded root fixture');
    await writeFile(join(dir, 'root.pem'), 'synthetic excluded root fixture');
    await writeFile(join(dir, 'apps/.env'), 'synthetic excluded fixture');
    await writeFile(join(dir, 'apps/private.key'), 'synthetic excluded fixture');
    await writeFile(join(dir, 'apps/private.pem'), 'synthetic excluded fixture');
    run('git', ['init', '-q']);
    run('git', ['add', '.']);
    run('git', ['-c', 'user.name=Test Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'source fixture']);
    const archiveStep = workflow.split('      - name: Preserve test evidence\n')[1].split('\n      - name:')[0];
    const archive = archiveStep.match(/        run: \|\n([\s\S]*)/)[1]
      .trimEnd().split('\n').map(line => line.slice(10)).join('\n');
    run('bash', ['-c', archive], { RUNNER_TEMP: join(dir, 'output'), EVIDENCE_HEAD_SHA: 'synthetic-fixture', EVIDENCE_JOB_STATUS: 'failure' });
    const evidence = join(dir, 'output/khedmah-test-evidence');
    const names = run('tar', ['-tzf', join(evidence, 'source-at-checkout.tar.gz')]);
    assert.match(names, /apps\/source\.ts/);
    assert.doesNotMatch(names, /\.env|(?:private|root)\.(?:key|pem)/);
    assert.match(await readFile(join(evidence, 'test-summary.txt'), 'utf8'), /NOT_EXECUTED/);
    assert.match(await readFile(join(evidence, 'source-sha256.txt'), 'utf8'), /^[a-f0-9]{64} /);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
