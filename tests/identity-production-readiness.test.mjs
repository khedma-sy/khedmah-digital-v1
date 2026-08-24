import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Web identity production gate is isolated from Android release credentials', async () => {
  const workflow = await read('.github/workflows/identity-production-readiness.yml');
  const gate = workflow.split('- name: Validate protected Web identity and email configuration')[1]
    ?.split('        run:')[0] ?? '';

  for (const required of [
    'RESEND_API_KEY', 'EMAIL_FROM', 'FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'OPERATIONS_PRODUCT_ROLE_BINDINGS',
  ]) {
    assert.ok(gate.includes(`          ${required}: `), `${required} is missing from the Web identity gate`);
  }

  for (const androidOnly of [
    'GOOGLE_OAUTH_ANDROID_CLIENT_ID', 'GOOGLE_MAPS_ANDROID_API_KEY',
    'GOOGLE_MAPS_ANDROID_SHA1', 'FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_B64',
  ]) {
    assert.ok(!gate.includes(androidOnly), `${androidOnly} must remain in Android certification, not Web identity readiness`);
  }
});

test('Web identity validator fails closed on missing production values', async () => {
  const validator = await read('scripts/validate-identity-production-readiness.mjs');
  assert.match(validator, /Missing Web identity production configuration/);
  assert.match(validator, /Web and backend Firebase project IDs must match/);
  assert.match(validator, /EMAIL_FROM must be a valid production sender address/);
});

test('production email defaults use the verified Resend sending domain', async () => {
  const provider = await read('apps/backend/src/identity/email/email-provider.ts');
  const cloudBuild = await read('cloudbuild.production.yaml');

  assert.match(provider, /noreply@mail\.khedmah\.uk/);
  assert.match(cloudBuild, /_EMAIL_FROM: noreply@mail\.khedmah\.uk/);
  assert.doesNotMatch(provider, /noreply@khedmah\.digital/);
  assert.doesNotMatch(cloudBuild, /_EMAIL_FROM: noreply@khedmah\.digital/);
});
