import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const workflow = await readFile(new URL('../.github/workflows/google-production-readiness.yml', import.meta.url), 'utf8');
const sourceJob = workflow.split('  validate-files:')[1].split('  production-secret-gate:')[0];

test('debug APK build remains on a hosted runner without protected credentials or deployment', () => {
  assert.match(sourceJob, /runs-on: ubuntu-latest/);
  assert.match(sourceJob, /java-version: 17/);
  assert.match(sourceJob, /"\$sdkmanager" "platforms;android-36" "build-tools;35\.0\.0"/);
  assert.match(sourceJob, /find "\$ANDROID_HOME\/cmdline-tools" -type f -name sdkmanager/);
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


test('android release WIF is restricted to protected main workflows', async () => {
  const wif = await readFile(new URL('../infra/iac/production_operator.tf', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('../scripts/bootstrap-new-production-project.sh', import.meta.url), 'utf8');
  assert.match(wif, /android-release-certification\.yml@refs\/heads\/main/);
  assert.match(bootstrap, /android-release-certification\.yml/);
});


test('release certification binds the APK certificate to the protected Android SHA-1', async () => {
  const release = await readFile(new URL('../.github/workflows/android-release-certification.yml', import.meta.url), 'utf8');
  assert.match(release, /EXPECTED_ANDROID_SHA1: \$\{\{ secrets\.GOOGLE_MAPS_ANDROID_SHA1 \}\}/);
  assert.match(release, /apksigner" verify --print-certs|apksigner.*--print-certs/);
  assert.match(release, /Signer #1 certificate SHA-1 digest/);
  assert.match(release, /ACTUAL_ANDROID_SHA1/);
  assert.match(release, /Android release certificate SHA-1 does not match/);
});
