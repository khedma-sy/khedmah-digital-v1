import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const gradle = fs.readFileSync('apps/android/app/build.gradle.kts', 'utf8');
const manifest = fs.readFileSync('apps/android/app/src/main/AndroidManifest.xml', 'utf8');
const googleIdentity = fs.readFileSync(
  'apps/android/app/src/main/java/com/khedmah/digital/GoogleIdentity.kt',
  'utf8'
);

const unusedFirebaseDataSdks = [
  'com.google.firebase:firebase-firestore',
  'com.google.firebase:firebase-storage',
  'com.google.firebase:firebase-analytics',
  'com.google.firebase:firebase-messaging'
];

test('Android keeps only the Firebase SDK required by its implemented Google identity flow', () => {
  assert.match(gradle, /com\.google\.firebase:firebase-auth/);
  assert.match(googleIdentity, /FirebaseAuth\.getInstance\(\)/);

  for (const dependency of unusedFirebaseDataSdks) {
    assert.equal(
      gradle.includes(dependency),
      false,
      `${dependency} must not be bundled until an implemented feature requires it and Data Safety is reviewed`
    );
  }
});

test('Android location permissions remain foreground-only and backup remains disabled', () => {
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.doesNotMatch(manifest, /android\.permission\.ACCESS_BACKGROUND_LOCATION/);
  assert.doesNotMatch(manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/);
  assert.match(manifest, /android:allowBackup="false"/);
});

test('Android does not declare notification access while messaging is not implemented', () => {
  assert.doesNotMatch(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.equal(gradle.includes('com.google.firebase:firebase-messaging'), false);
});
