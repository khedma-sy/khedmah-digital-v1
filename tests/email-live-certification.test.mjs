import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/email-live-certification.yml', import.meta.url), 'utf8');
const script = await readFile(new URL('../scripts/certify-staging-email-live.sh', import.meta.url), 'utf8');

test('live email certification is reusable before main and independent of Staging WIF', () => {
  assert.match(workflow, /STAGING_BACKEND_URL/);
  assert.match(workflow, /bash scripts\/certify-staging-email-live\.sh/);
  assert.doesNotMatch(workflow, /id-token: write|google-github-actions\/auth|GCP_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(script, /BACKEND_URL must use HTTPS/);
  assert.match(script, /EMAIL_LIVE_REQUEST=PASSED/);
});

test('live email request safely resends for an existing pending account and keeps login blocked', () => {
  assert.match(script, /elif \[\[ "\$status" = "409" \]\]/);
  assert.match(script, /\/api\/v1\/auth\/email-verification\/request/);
  assert.match(script, /If verification is required, an email has been sent\./);
  assert.match(script, /\[\[ "\$login_status" = "401" \|\| "\$login_status" = "403" \]\]/);
});

test('live email confirmation proves login and an authenticated session after verification', () => {
  assert.match(script, /\/api\/v1\/auth\/email-verification\/confirm/);
  assert.match(script, /Email verified successfully\./);
  assert.match(script, /\/api\/v1\/auth\/session/);
  assert.match(script, /\[\[ "\$session_status" = "200" \]\]/);
  assert.match(script, /EMAIL_LIVE_CONFIRM=PASSED/);
});
