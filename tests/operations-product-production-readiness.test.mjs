import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('Operations Product repository readiness gate has no local failures', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-operations-readiness.mjs'], { encoding: 'utf8' });
  const report = JSON.parse(output);
  assert.equal(report.mode, 'repository');
  assert.equal(report.summary.fail ?? 0, 0);
  assert.ok(report.summary.pass >= 40);
});

test('repository readiness treats an unavailable cached Terraform provider as external', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'khedmah-operations-terraform-'));
  const bin = join(sandbox, 'bin');
  const terraform = join(bin, 'terraform');
  await mkdir(bin);
  await writeFile(terraform, `#!/usr/bin/env bash
printf '%s\n' 'Error: registry.terraform.io/hashicorp/google: there is no package for registry.terraform.io/hashicorp/google 6.50.0 cached in .terraform/providers' >&2
exit 1
`);
  await chmod(terraform, 0o700);
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const output = execFileSync(process.execPath, ['scripts/validate-operations-readiness.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  const report = JSON.parse(output);
  const terraformResult = report.results.find((result) => result.name === 'terraform validate');

  assert.equal(report.summary.fail ?? 0, 0);
  assert.equal(terraformResult?.status, 'pending_external');
  assert.equal(terraformResult?.detail, 'Provider or backend initialization unavailable in this environment');
});

test('repository readiness treats an uninitialized production backend as external', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'khedmah-operations-backend-'));
  const bin = join(sandbox, 'bin');
  const terraform = join(bin, 'terraform');
  await mkdir(bin);
  await writeFile(terraform, `#!/usr/bin/env bash
printf '%s\n' 'Error: Backend initialization required: please run "terraform init"' >&2
exit 1
`);
  await chmod(terraform, 0o700);
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const output = execFileSync(process.execPath, ['scripts/validate-operations-readiness.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  const report = JSON.parse(output);
  const terraformResult = report.results.find((result) => result.name === 'terraform validate');

  assert.equal(report.summary.fail ?? 0, 0);
  assert.equal(terraformResult?.status, 'pending_external');
  assert.equal(terraformResult?.detail, 'Provider or backend initialization unavailable in this environment');
});

test('Operations Product production gate fails closed without injected production evidence', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/validate-operations-readiness.mjs', '--production'], { encoding: 'utf8', env: {} }));
});

test('live certification execution refuses an unapproved environment', () => {
  assert.throws(() => execFileSync('bash', ['scripts/run-live-production-certification.sh'], { encoding: 'utf8', env: {} }));
});

test('live evidence collection refuses missing tooling without changing its parent permissions', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'khedmah-live-evidence-test-'));
  const bin = join(sandbox, 'bin');
  const output = join(sandbox, 'evidence');
  await mkdir(bin);
  for (const [name, target] of [
    ['mkdir', '/usr/bin/mkdir'],
    ['chmod', '/usr/bin/chmod'],
  ]) {
    const wrapper = join(bin, name);
    await writeFile(wrapper, `#!/bin/bash\nexec ${target} "$@"\n`);
    await chmod(wrapper, 0o700);
  }
  await chmod(sandbox, 0o755);
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  let stderr = '';
  assert.throws(() => {
    try {
      execFileSync('/bin/bash', ['scripts/collect-live-production-evidence.sh', output], {
        encoding: 'utf8',
        env: { PATH: bin },
      });
    } catch (error) {
      stderr = String(error.stderr ?? '');
      throw error;
    }
  });

  assert.match(stderr, /missing required command: gcloud/);
  assert.doesNotMatch(stderr, /changing permissions/);
  assert.equal((await stat(sandbox)).mode & 0o777, 0o755);
  assert.equal((await stat(output)).mode & 0o777, 0o700);
});
