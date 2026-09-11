import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gradle = await readFile(new URL('../apps/android/app/build.gradle.kts', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../apps/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const releaseScript = await readFile(new URL('../scripts/build-android-release.sh', import.meta.url), 'utf8');

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

test('Android release files contain no committed keystore password literal', () => {
  for (const source of [gradle, releaseScript]) {
    assert.doesNotMatch(source, /storePassword\s*=\s*"[^"$]+"/);
    assert.doesNotMatch(source, /keyPassword\s*=\s*"[^"$]+"/);
  }
});
