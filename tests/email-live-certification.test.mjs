import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/email-live-certification.yml', import.meta.url), 'utf8');

test('live email certification is repeatable for an existing pending account', () => {
  assert.match(workflow, /elif \[\[ "\$status" = "409" \]\]/);
  assert.match(workflow, /\/api\/v1\/auth\/email-verification\/request/);
  assert.match(workflow, /If verification is required, an email has been sent\./);
  assert.match(workflow, /test "\$login_status" = "401" \|\| test "\$login_status" = "403"/);
});

test('live email confirmation proves an authenticated session after verification', () => {
  assert.match(workflow, /\/api\/v1\/auth\/email-verification\/confirm/);
  assert.match(workflow, /Email verified successfully\./);
  assert.match(workflow, /\/api\/v1\/auth\/session/);
  assert.match(workflow, /test "\$session_status" = "200"/);
});
