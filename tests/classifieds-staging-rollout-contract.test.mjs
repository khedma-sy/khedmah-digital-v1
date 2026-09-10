import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(new URL('..', import.meta.url).pathname);
const resolver = join(root, 'scripts/deployment/resolve-classifieds-staging-stage.sh');
const workflow = join(root, '.github/workflows/staging-deployment.yml');

function runStage(stage) {
  const dir = mkdtemp(join(tmpdir(), 'khedmah-staging-stage-'));
  return Promise.resolve(dir).then(async (directory) => {
    const file = join(directory, 'stage');
    await writeFile(file, `${stage}\n`);
    await chmod(resolver, 0o755);
    return spawnSync(resolver, [file], { cwd: root, encoding: 'utf8' });
  });
}

function parse(text) {
  return Object.fromEntries(text.trim().split(/\n/).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

test('Staging rollout stage is fail-closed and ordered', async () => {
  const expected = {
    off: ['false', 'false', 'off', ''],
    'apply-025': ['false', 'false', 'apply', 'APPLY_KHEDMAH_NONPROD_025_STAGING'],
    'verify-025': ['false', 'false', 'verify', ''],
    'backend-on': ['true', 'false', 'verify', ''],
    'frontend-on': ['true', 'true', 'verify', '']
  };
  for (const [stage, values] of Object.entries(expected)) {
    const result = await runStage(stage);
    assert.equal(result.status, 0, `${stage}: ${result.stderr}`);
    const output = parse(result.stdout);
    assert.deepEqual(
      [output.backend_enabled, output.frontend_enabled, output.migration_mode, output.migration_confirmation],
      values,
      stage
    );
  }
  const invalid = await runStage('production-on');
  assert.notEqual(invalid.status, 0);
});

test('Staging workflow uses repository stage outputs and never production rollout variables', async () => {
  const text = await readFile(workflow, 'utf8');
  assert.match(text, /Resolve Classifieds Staging rollout stage/);
  assert.match(text, /resolve-classifieds-staging-stage\.sh/);
  assert.match(text, /CLASSIFIEDS_ENABLED: \$\{\{ steps\.classifieds-stage\.outputs\.backend_enabled \}\}/);
  assert.match(text, /NEXT_PUBLIC_CLASSIFIEDS_ENABLED: \$\{\{ steps\.classifieds-stage\.outputs\.frontend_enabled \}\}/);
  assert.match(text, /CLASSIFIEDS_MIGRATION_025_MODE: \$\{\{ steps\.classifieds-stage\.outputs\.migration_mode \}\}/);
  assert.doesNotMatch(text, /vars\.CLASSIFIEDS_ENABLED/);
  assert.doesNotMatch(text, /vars\.NEXT_PUBLIC_CLASSIFIEDS_ENABLED/);
  assert.doesNotMatch(text, /APPLY_KHEDMAH_NONPROD_025_PRODUCTION/);
  assert.match(text, /classifieds-staging-acceptance:/);
  assert.match(text, /needs\.deploy-staging\.outputs\.classifieds_frontend_enabled == 'true'/);
  assert.match(text, /check-classifieds-preview-acceptance\.mjs/);
  assert.match(text, /EVIDENCE_DIR: staging-evidence/);
});
