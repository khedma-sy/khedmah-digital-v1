import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const resolver = 'scripts/deployment/resolve-classifieds-staging-stage.sh';
const expected = {
  off: { backend_enabled: 'false', frontend_enabled: 'false', migration_mode: 'off', migration_confirmation: '' },
  'apply-025': { backend_enabled: 'false', frontend_enabled: 'false', migration_mode: 'apply', migration_confirmation: 'APPLY_KHEDMAH_NONPROD_025_STAGING' },
  'verify-025': { backend_enabled: 'false', frontend_enabled: 'false', migration_mode: 'verify', migration_confirmation: '' },
  'backend-on': { backend_enabled: 'true', frontend_enabled: 'false', migration_mode: 'verify', migration_confirmation: '' },
  'frontend-on': { backend_enabled: 'true', frontend_enabled: 'true', migration_mode: 'verify', migration_confirmation: '' }
};

function parseOutput(output) {
  return Object.fromEntries(output.trimEnd().split('\n').map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

test('Classifieds Staging tracked stage defaults off', async () => {
  assert.equal((await readFile('.github/classifieds-staging-stage', 'utf8')).trim(), 'off');
});

for (const [stage, values] of Object.entries(expected)) {
  test(`Classifieds Staging resolver maps ${stage} safely`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'khedmah-staging-stage-'));
    const stageFile = join(directory, 'stage');
    await writeFile(stageFile, `${stage}\n`);
    const result = spawnSync('bash', [resolver], { encoding: 'utf8', env: { ...process.env, CLASSIFIEDS_STAGING_STAGE_FILE: stageFile } });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(parseOutput(result.stdout), { stage, ...values });
  });
}

test('Classifieds Staging resolver rejects unknown stages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'khedmah-staging-stage-'));
  const stageFile = join(directory, 'stage');
  await writeFile(stageFile, 'production-on\n');
  const result = spawnSync('bash', [resolver], { encoding: 'utf8', env: { ...process.env, CLASSIFIEDS_STAGING_STAGE_FILE: stageFile } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown Classifieds Staging rollout stage/);
});

test('Staging workflow derives Classifieds from tracked stage and gates browser acceptance', async () => {
  const workflow = await readFile('.github/workflows/staging-deployment.yml', 'utf8');
  for (const token of ['steps.classifieds-stage.outputs.backend_enabled', 'steps.classifieds-stage.outputs.frontend_enabled', 'steps.classifieds-stage.outputs.migration_mode', 'steps.classifieds-stage.outputs.migration_confirmation']) assert.match(workflow, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(workflow, /vars\.(?:CLASSIFIEDS_ENABLED|NEXT_PUBLIC_CLASSIFIEDS_ENABLED|CLASSIFIEDS_MIGRATION_025_MODE|CLASSIFIEDS_MIGRATION_025_CONFIRMATION)/);
  assert.match(workflow, /classifieds-staging-acceptance:/);
  assert.match(workflow, /classifieds_frontend_enabled == 'true'/);
  assert.match(workflow, /EVIDENCE_DIR: staging-evidence/);
});

test('Production operator still exposes no migration 025', async () => {
  const production = await readFile('.github/workflows/production-operator.yml', 'utf8');
  assert.doesNotMatch(production, /APPLY_MIGRATION_025|025_classifieds/);
});
