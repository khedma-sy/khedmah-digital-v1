import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const workflow = await readFile(new URL('../.github/workflows/google-production-readiness.yml', import.meta.url), 'utf8');
const sourceJob = workflow.split('  validate-files:')[1].split('  production-secret-gate:')[0];

test('debug APK build remains on a hosted runner without protected credentials or deployment', () => {
  assert.match(sourceJob, /runs-on: ubuntu-latest/);
  assert.match(sourceJob, /java-version: 17/);
  assert.match(sourceJob, /sdkmanager "platforms;android-36" "build-tools;35\.0\.0"/);
  assert.match(sourceJob, /persist-credentials: false/);
  assert.match(sourceJob, /cache-read-only: true/);
  assert.doesNotMatch(sourceJob, /secrets\.|environment: production|gcloud|continue-on-error/);
});

test('APK publication follows compilation, signature validation and SHA-256 generation', () => {
  const build = sourceJob.indexOf('run: npm run build:android');
  const verify = sourceJob.indexOf('apksigner');
  const checksum = sourceJob.indexOf('sha256sum app-debug.apk');
  const upload = sourceJob.indexOf('uses: actions/upload-artifact@');
  assert.ok(build >= 0 && verify > build && checksum > verify && upload > checksum);
  assert.match(sourceJob, /name: khedmah-debug-apk/);
  assert.match(sourceJob, /if-no-files-found: error/);
  assert.match(sourceJob, /apps\/android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
});

test('debug artifact records source provenance and does not claim runtime or release readiness', () => {
  assert.match(sourceJob, /git rev-parse HEAD/);
  assert.match(sourceJob, /"artifactKind":"debug-unconfigured"/);
  assert.match(sourceJob, /"productionReady":false/);
  assert.match(sourceJob, /"deviceTested":false/);
  assert.match(sourceJob, /runtime configuration are not injected/);
  assert.match(workflow, /production-secret-gate:\n    if: github\.event_name == 'workflow_dispatch'\n    environment: production/);
});
