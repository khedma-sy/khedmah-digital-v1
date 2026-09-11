import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gradle = await readFile(new URL('../apps/android/app/build.gradle.kts', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../apps/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const releaseScript = await readFile(new URL('../scripts/build-android-release.sh', import.meta.url), 'utf8');
const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');

test('Android release signing is externalized and cleartext traffic is forbidden', () => {
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  for (const name of [
    'ANDROID_RELEASE_KEYSTORE_PATH',
    'ANDROID_RELEASE_KEYSTORE_PASSWORD',
    'ANDROID_RELEASE_KEY_ALIAS',
    'ANDROID_RELEASE_KEY_PASSWORD'
  ]) {
    assert.match(gradle, new RegExp(name));
    assert.match(releaseScript, new RegExp(name));
  }
  assert.match(gradle, /signingConfigs\.create|create\("release"\)/);
  assert.match(releaseScript, /:app:bundleRelease/);
  assert.match(releaseScript, /jarsigner -verify/);
  assert.match(releaseScript, /KHEDMAH_API_BASE_URL.*https:\/\//s);
});

test('Android Play version metadata is supplied per release and bounded before Gradle executes', () => {
  for (const name of ['ANDROID_VERSION_CODE', 'ANDROID_VERSION_NAME']) {
    assert.match(gradle, new RegExp(name));
    assert.match(releaseScript, new RegExp(name));
  }
  assert.match(releaseScript, /ANDROID_VERSION_CODE.*positive decimal integer/s);
  assert.match(releaseScript, /2100000000/);
  assert.match(releaseScript, /ANDROID_VERSION_NAME.*100 characters or fewer/s);
  assert.match(gradle, /versionCode\s*=\s*configuredVersionCode\s*\?:\s*1/);
  assert.match(gradle, /versionName\s*=\s*configuredVersionName\s*\?:\s*"1\.0"/);
});

test('Android release requires protected Firebase material without tracking it', () => {
  assert.match(releaseScript, /apps\/android\/app\/google-services\.json/);
  assert.match(releaseScript, /never commit it/);
  assert.match(gitignore, /\*\*\/google-services\.json/);
  assert.match(gradle, /file\("google-services\.json"\)\.isFile/);
});

test('Android release files contain no committed keystore password literal', () => {
  for (const source of [gradle, releaseScript]) {
    assert.doesNotMatch(source, /storePassword\s*=\s*"[^"$]+"/);
    assert.doesNotMatch(source, /keyPassword\s*=\s*"[^"$]+"/);
  }
});
