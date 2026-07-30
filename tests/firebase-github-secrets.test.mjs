import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

function structuralEnvironment() {
  const nonce = randomUUID();
  const projectId = `firebase-secret-contract-${nonce}`;
  const apiKey = randomUUID().replaceAll('-', '');
  const android = {
    project_info: { project_id: projectId },
    client: [{ client_info: { android_client_info: { package_name: 'com.khedmah.digital' } } }]
  };
  return {
    FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_B64: Buffer.from(JSON.stringify(android)).toString('base64'),
    NEXT_PUBLIC_FIREBASE_API_KEY: apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${nonce}.invalid`,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${nonce}.invalid`,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: String(Date.now()),
    NEXT_PUBLIC_FIREBASE_APP_ID: randomUUID(),
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: randomUUID()
  };
}

test('Firebase GitHub secret contract validates without printing values', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-firebase-github-secrets.mjs'], { env: structuralEnvironment(), encoding: 'utf8' });
  assert.match(output, /8 secret names; values redacted/);
  assert.doesNotMatch(output, /firebase-secret-contract-/);
});

test('Firebase GitHub secret contract fails closed when any secret is absent', () => {
  const env = structuralEnvironment();
  delete env.NEXT_PUBLIC_FIREBASE_APP_ID;
  assert.throws(() => execFileSync(process.execPath, ['scripts/verify-firebase-github-secrets.mjs'], { env, stdio: 'pipe' }));
});
