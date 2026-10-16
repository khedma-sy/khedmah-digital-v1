import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PREVIEW_V2_VARIABLES, verifyPreviewV2Configuration } from '../scripts/deployment/verify-preview-v2-configuration.mjs';
import { readPreviewMailMetadata } from '../scripts/deployment/read-preview-mail-metadata.mjs';

const context = { ...PREVIEW_V2_VARIABLES, PREVIEW_V2_CONFIGURATION_READY: 'true',
  PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_FIREBASE_PROJECT_ID: 'khedma-dl',
  GITHUB_REPOSITORY: 'khedma-sy/khedmah-digital-v1', GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_REF: 'refs/pull/274/merge',
  GITHUB_WORKFLOW_REF: 'khedma-sy/khedmah-digital-v1/.github/workflows/preview-deployment.yml@refs/pull/274/merge' };
const root = fileURLToPath(new URL('..', import.meta.url));

test('configuration guard accepts the complete pinned replacement and rejects every missing or wrong field', () => {
  assert.equal(verifyPreviewV2Configuration(context).configuration_verified, true);
  for (const key of Object.keys(context)) {
    assert.throws(() => verifyPreviewV2Configuration({ ...context, [key]: '' }));
    assert.throws(() => verifyPreviewV2Configuration({ ...context, [key]: 'other' }));
  }
});

test('workflow verifies current source and all identity variables before OIDC and retains both holds', () => {
  const workflow = readFileSync(new URL('../.github/workflows/preview-deployment.yml', import.meta.url), 'utf8');
  const deploy = workflow.split('  deploy-preview:\n')[1].split('  resolve-staging-baseline:')[0];
  const source = deploy.indexOf('run: node scripts/deployment/verify-preview-source.mjs');
  const config = deploy.indexOf('run: node scripts/deployment/verify-preview-v2-configuration.mjs');
  const auth = deploy.indexOf('uses: google-github-actions/auth@v3');
  const hold = deploy.indexOf('PREVIEW_MAIL_METADATA_COMPLETE_DEPLOYMENT_HELD');
  assert.ok(source > 0 && config > source && auth > config && hold > auth);
  assert.match(deploy.slice(hold), /exit 1\n/);
  assert.ok(deploy.indexOf('run: scripts/deployment/deploy-cloud-run-environment.sh') > hold);
  for (const name of Object.keys(PREVIEW_V2_VARIABLES)) assert.ok(deploy.includes(name + ': ${{ vars.' + name + ' }}'));
  assert.doesNotMatch(workflow, /secrets\.GCP_(?:WORKLOAD_IDENTITY_PROVIDER|PREVIEW_DEPLOYER_SERVICE_ACCOUNT|PREVIEW_RUNTIME_SERVICE_ACCOUNT)/);
  const cleanup = workflow.split('  cleanup-preview:\n')[1];
  const cleanupHold = cleanup.indexOf('PREVIEW_V2_CLEANUP_HELD_NO_CLOUD_ACCESS');
  assert.ok(cleanupHold > 0 && cleanupHold < cleanup.indexOf('google-github-actions/auth@v3'));
  const holdStep = cleanup.split('      - name: Hold cleanup during replacement Preview preparation\n')[1].split('      - name:')[0];
  const holdScript = holdStep.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const result = spawnSync('bash', ['-c', holdScript + '\necho MUST_NOT_AUTHENTICATE'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.ok(!result.stdout.includes('MUST_NOT_AUTHENTICATE'));
});

test('replacement Preview cloud authority remains scoped to PR 274', () => {
  const workflow = readFileSync(new URL('../.github/workflows/preview-deployment.yml', import.meta.url), 'utf8');
  const deploy = workflow.split('  deploy-preview:\n')[1].split('  resolve-staging-baseline:')[0];
  const baseline = workflow.split('  resolve-staging-baseline:\n')[1].split('  review-evidence:')[0];
  const cleanup = workflow.split('  cleanup-preview:\n')[1];
  assert.match(deploy, /if: github\.event\.action != 'closed' && github\.event\.pull_request\.number == 274/);
  assert.match(baseline, /if: github\.event\.action != 'closed' && github\.event\.pull_request\.number == 274/);
  assert.match(cleanup, /if: github\.event\.action == 'closed' && github\.event\.pull_request\.number == 274/);
});

test('mail metadata accepts the replacement numeric namespace under its real pinned pool policy', () => {
  const project = PREVIEW_V2_VARIABLES.PREVIEW_GOOGLE_CLOUD_PROJECT;
  const env = { DEPLOYMENT_ENVIRONMENT: 'preview', GOOGLE_CLOUD_PROJECT: project,
    GOOGLE_CLOUD_REGION: 'europe-west1', ARTIFACT_REPOSITORY: 'khedmah-preview',
    RUNTIME_SERVICE_ACCOUNT: PREVIEW_V2_VARIABLES.PREVIEW_V2_RUNTIME_SERVICE_ACCOUNT,
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: PREVIEW_V2_VARIABLES.PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME,
    PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_FIREBASE_PROJECT_ID: 'khedma-dl',
    PREVIEW_SCHEMA_POOL_SERIALIZED: 'true', GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'PR Preview', GITHUB_REPOSITORY: context.GITHUB_REPOSITORY };
  const parent = 'projects/1044962071847/secrets/RESEND_API_KEY';
  const responses = [{ name: parent }, [], { name: parent + '/versions/1', state: 'DISABLED' }];
  let calls = 0;
  const report = readPreviewMailMetadata(env, (_tool, args) => {
    assert.ok(args.includes('--project=' + project));
    return { status: 0, stdout: JSON.stringify(responses[calls++]), stderr: '' };
  });
  assert.equal(calls, 3); assert.equal(report.reads.latest.state, 'DISABLED');
  assert.equal(report.email_delivery_verified, false);
  assert.throws(() => readPreviewMailMetadata({ ...env, GOOGLE_CLOUD_PROJECT: 'khedmah-preview-774201339973' }, () => assert.fail('old project read')));
});

test('owner-operated federation and configuration batch regressions', () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_preview_v2_github.py', '-v'],
    { cwd: root, encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
