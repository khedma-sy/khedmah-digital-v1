import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const deployScript = new URL('../scripts/deployment/deploy-cloud-run-environment.sh', import.meta.url);
const ensureScript = new URL('../scripts/deployment/ensure-classifieds-nonproduction-schema.sh', import.meta.url);
const migrationScript = new URL('../scripts/deployment/run-classifieds-nonproduction-migration.sh', import.meta.url);
const previewStageScript = new URL('../scripts/deployment/resolve-classifieds-preview-stage.sh', import.meta.url);
const migration = read('backend/migrations/versions/025_classifieds.sql');
const migrationSha = createHash('sha256').update(Buffer.from(migration)).digest('hex');

const baseEnv = {
  ...process.env,
  GOOGLE_CLOUD_PROJECT: 'khedmah-preview-safe',
  GOOGLE_CLOUD_REGION: 'europe-west1',
  ARTIFACT_REPOSITORY: 'khedmah-preview',
  RUNTIME_SERVICE_ACCOUNT: 'preview-runtime@example.invalid',
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'khedmah-preview-safe:europe-west1:preview-db',
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedmah-production-protected'
};

function runBash(script, args, env = {}) {
  return spawnSync('bash', [fileURLToPath(script), ...args], {
    cwd: root,
    env: { ...baseEnv, ...env },
    encoding: 'utf8'
  });
}

function runSh(script, env = {}) {
  return spawnSync('sh', [fileURLToPath(script)], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
}

test('migration 025 checksum remains the reviewed non-production artifact', () => {
  assert.equal(migrationSha, '0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d');
  assert.match(read('scripts/deployment/ensure-classifieds-nonproduction-schema.sh'), new RegExp(migrationSha));
  assert.match(read('scripts/deployment/run-classifieds-nonproduction-migration.sh'), new RegExp(migrationSha));
});

test('non-production deploy rejects Production and invalid feature ordering before cloud execution', () => {
  const production = runBash(deployScript, ['preview', 'pr-166-11901ac'], {
    GOOGLE_CLOUD_PROJECT: 'same-project',
    PRODUCTION_GOOGLE_CLOUD_PROJECT: 'same-project',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'same-project:europe-west1:preview-db'
  });
  assert.equal(production.status, 4);
  assert.match(production.stderr, /Refusing to deploy to the production project/);

  const frontendFirst = runBash(deployScript, ['preview', 'pr-166-11901ac'], {
    CLASSIFIEDS_ENABLED: 'false',
    NEXT_PUBLIC_CLASSIFIEDS_ENABLED: 'true',
    CLASSIFIEDS_MIGRATION_025_MODE: 'verify'
  });
  assert.equal(frontendFirst.status, 4);
  assert.match(frontendFirst.stderr, /Frontend Classifieds cannot be enabled before backend Classifieds/);

  const backendWithoutSchema = runBash(deployScript, ['preview', 'pr-166-11901ac'], {
    CLASSIFIEDS_ENABLED: 'true',
    NEXT_PUBLIC_CLASSIFIEDS_ENABLED: 'false',
    CLASSIFIEDS_MIGRATION_025_MODE: 'off'
  });
  assert.equal(backendWithoutSchema.status, 4);
  assert.match(backendWithoutSchema.stderr, /requires migration 025 verification/);
});

test('schema gate defaults off and apply requires an environment-specific confirmation', () => {
  const off = runBash(ensureScript, ['preview', 'pr-166-11901ac']);
  assert.equal(off.status, 0);
  assert.match(off.stdout, /operation is off/);

  const applyWithoutConfirmation = runBash(ensureScript, ['preview', 'pr-166-11901ac'], {
    CLASSIFIEDS_MIGRATION_025_MODE: 'apply'
  });
  assert.equal(applyWithoutConfirmation.status, 4);
  assert.match(applyWithoutConfirmation.stderr, /confirmation token is missing or invalid/);
});

test('migration runner itself refuses Production before touching PostgreSQL', () => {
  const result = runSh(migrationScript, {
    DEPLOYMENT_ENVIRONMENT: 'preview',
    MIGRATION_MODE: 'verify',
    GOOGLE_CLOUD_PROJECT: 'same-project',
    PRODUCTION_GOOGLE_CLOUD_PROJECT: 'same-project'
  });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /Refusing Classifieds migration 025 against the production project/);
});

test('Preview rollout inputs belong to deploy-preview, never cleanup-preview', () => {
  const workflow = read('.github/workflows/preview-deployment.yml');
  const deploy = workflow.slice(workflow.indexOf('  deploy-preview:'), workflow.indexOf('  review-evidence:'));
  const cleanup = workflow.slice(workflow.indexOf('  cleanup-preview:'));
  const names = ['CLASSIFIEDS_ENABLED:', 'NEXT_PUBLIC_CLASSIFIEDS_ENABLED:', 'CLASSIFIEDS_MIGRATION_025_MODE:', 'CLASSIFIEDS_MIGRATION_025_CONFIRMATION:'];
  for (const name of names) {
    assert.match(deploy, new RegExp(name));
    assert.doesNotMatch(cleanup, new RegExp(name));
  }
});

test('frontend build flags default false in both isolated environments', () => {
  const docker = read('Dockerfile.frontend');
  assert.match(docker, /ARG NEXT_PUBLIC_CLASSIFIEDS_ENABLED=false/);
  for (const path of ['cloudbuild.preview.yaml', 'cloudbuild.staging.yaml']) {
    const build = read(path);
    assert.match(build, /_NEXT_PUBLIC_CLASSIFIEDS_ENABLED: "false"/);
    assert.match(build, /--build-arg NEXT_PUBLIC_CLASSIFIEDS_ENABLED="\$\{_NEXT_PUBLIC_CLASSIFIEDS_ENABLED\}"/);
  }
});

test('Preview rollout stage resolver preserves DB-before-backend-before-frontend ordering', () => {
  const cases = new Map([
    ['off', { backend_enabled: 'false', frontend_enabled: 'false', migration_mode: 'off', migration_confirmation: '' }],
    ['apply-025', { backend_enabled: 'false', frontend_enabled: 'false', migration_mode: 'apply', migration_confirmation: 'APPLY_KHEDMAH_NONPROD_025_PREVIEW' }],
    ['verify-025', { backend_enabled: 'false', frontend_enabled: 'false', migration_mode: 'verify', migration_confirmation: '' }],
    ['backend-on', { backend_enabled: 'true', frontend_enabled: 'false', migration_mode: 'verify', migration_confirmation: '' }],
    ['frontend-on', { backend_enabled: 'true', frontend_enabled: 'true', migration_mode: 'verify', migration_confirmation: '' }]
  ]);
  for (const [stage, expected] of cases) {
    const stagePath = new URL(`../.tmp-classifieds-preview-stage-${stage}`, import.meta.url);
    const stageFile = fileURLToPath(stagePath);
    writeFileSync(stageFile, `${stage}\n`);
    const result = spawnSync('bash', [fileURLToPath(previewStageScript), stageFile], { cwd: root, encoding: 'utf8' });
    unlinkSync(stageFile);
    assert.equal(result.status, 0, `${stage}: ${result.stderr}`);
    const output = Object.fromEntries(result.stdout.trim().split('\n').map((line) => line.split('=', 2)));
    assert.equal(output.backend_enabled, expected.backend_enabled, stage);
    assert.equal(output.frontend_enabled, expected.frontend_enabled, stage);
    assert.equal(output.migration_mode, expected.migration_mode, stage);
    assert.equal(output.migration_confirmation, expected.migration_confirmation, stage);
  }
});

test('tracked Preview stage is explicit and Production has no equivalent activation control', () => {
  const stage = read('.github/classifieds-preview-stage').trim();
  assert.ok(['off','apply-025','verify-025','backend-on','frontend-on'].includes(stage));
  const workflow = read('.github/workflows/preview-deployment.yml');
  assert.match(workflow, /resolve-classifieds-preview-stage\.sh/);
  assert.match(workflow, /steps\.classifieds-stage\.outputs\.migration_mode/);
  assert.doesNotMatch(read('.github/workflows/production-operator.yml'), /classifieds-preview-stage|resolve-classifieds-preview-stage/);
});

test('failed non-production migration execution emits bounded Cloud Run diagnostics', () => {
  const ensure = read('scripts/deployment/ensure-classifieds-nonproduction-schema.sh');
  for (const marker of ['CLASSIFIEDS_025_FAILED_EXECUTION', 'CLASSIFIEDS_025_CONTAINER_LOGS_BEGIN', 'CLASSIFIEDS_025_CONTAINER_LOGS_END']) {
    assert.match(ensure, new RegExp(marker));
  }
  assert.match(ensure, /gcloud run jobs executions describe/);
  assert.match(ensure, /gcloud logging read/);
  assert.match(ensure, /--freshness=30m/);
  assert.match(ensure, /--limit=200/);
});

test('Production operator has no Classifieds migration 025 capability', () => {
  const production = read('.github/workflows/production-operator.yml');
  assert.doesNotMatch(production, /APPLY_MIGRATION_025/);
  assert.doesNotMatch(production, /025_classifieds/);
  assert.doesNotMatch(production, /CLASSIFIEDS_MIGRATION_025/);
});
