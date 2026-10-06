import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('tracked environment contracts align with the approved Production region and browser-origin handoff', async () => {
  const [example, production] = await Promise.all([read('.env.example'), read('.env.production')]);
  assert.match(example, /^GOOGLE_CLOUD_REGION=europe-west1$/m);
  assert.doesNotMatch(example, /^GOOGLE_CLOUD_REGION=me-central1$/m);
  assert.match(production, /^GOOGLE_CLOUD_REGION=europe-west1$/m);
  for (const name of ['CORS_ORIGIN', 'NEXT_PUBLIC_SITE_URL', 'GOOGLE_MAPS_ALLOWED_WEB_ORIGINS']) {
    assert.match(production, new RegExp(`^${name}=\\s*$`, 'm'), `missing Production contract field: ${name}`);
  }
});

test('Floot migration is explicitly bound to the Google integration gate and final domain topology', async () => {
  const [plan, gate] = await Promise.all([
    read('docs/floot-migration/MIGRATION-PLAN.md'),
    read('docs/project-control/FLOOT-GOOGLE-INTEGRATION-GATE.md')
  ]);
  assert.match(plan, /FLOOT-GOOGLE-INTEGRATION-GATE\.md/);
  for (const value of ['khedmah.uk', 'www.khedmah.uk', 'api.khedmah.uk', 'Cloudflare', 'Floot', 'Google Cloud']) {
    assert.match(gate, new RegExp(value.replace('.', '\\.')));
  }
  assert.match(gate, /Do not widen Production CORS, CSRF or cookie policy/i);
  assert.match(gate, /never receive Cloud SQL credentials/i);
  assert.match(gate, /europe-west1/);
});

test('current browser-session boundary stays credentialed, HttpOnly and explicit-origin guarded', async () => {
  const [cookie, csrf] = await Promise.all([
    read('apps/backend/src/identity/session-cookie.ts'),
    read('apps/backend/src/middleware/csrf-origin.middleware.ts')
  ]);
  assert.match(cookie, /httpOnly:\s*true/);
  assert.match(cookie, /secure:\s*isHttpsDeployment\(\)/);
  assert.match(cookie, /sameSite:\s*sessionCookieSameSite\(\)/);
  assert.match(csrf, /process\.env\.CORS_ORIGIN/);
  assert.match(csrf, /Request origin is not allowed\./);
  assert.doesNotMatch(csrf, /allowedOrigins\.add\(['"]\*['"]\)/);
});
