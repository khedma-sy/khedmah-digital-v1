import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const script = fileURLToPath(new URL('../scripts/deployment/resolve-preview-email-config.sh', import.meta.url));
function run(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'khedmah-email-binding-'));
  const calls = join(directory, 'calls');
  try {
    writeFileSync(join(directory, 'gcloud'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALL_LOG"\n[ "$METADATA_MODE" != denied ] || exit 1\n[ "$METADATA_MODE" = empty ] || printf "projects/preview-fixture/secrets/RESEND_API_KEY/versions/1\\n"\n');
    chmodSync(join(directory, 'gcloud'), 0o755);
    const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, CALL_LOG: calls, DEPLOYMENT_ENVIRONMENT: 'preview', GOOGLE_CLOUD_PROJECT: 'preview-fixture', PRODUCTION_GOOGLE_CLOUD_PROJECT: 'production-fixture', EMAIL_FROM: '', METADATA_MODE: 'ready', ...overrides };
    const result = spawnSync('bash', [script], { encoding: 'utf8', env });
    return { ...result, calls: existsSync(calls) ? readFileSync(calls, 'utf8') : '' };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test('existing Preview metadata enables only a local secret reference, without accessing values', () => {
  const result = run(); assert.equal(result.status, 0); assert.equal(result.stdout.trim(), 'noreply@mail.khedmah.uk');
  assert.match(result.calls, /secrets versions list RESEND_API_KEY --project preview-fixture/);
  assert.doesNotMatch(result.calls, /versions access|secrets create|secrets add|production-fixture/);
  assert.doesNotMatch(result.stdout, /projects\//); assert.match(result.stderr, /delivery remains unverified/);
});
for (const mode of ['denied', 'empty']) test(`${mode}: resolver reports mail not ready and never substitutes another key`, () => {
  const result = run({ METADATA_MODE: mode }); assert.equal(result.status, 0); assert.equal(result.stdout, '');
  assert.match(result.stderr, /NOT READY/); assert.equal(result.calls.trim().split('\n').length, 1);
});
for (const overrides of [{ DEPLOYMENT_ENVIRONMENT: 'production' }, { GOOGLE_CLOUD_PROJECT: 'production-fixture' }, { PRODUCTION_GOOGLE_CLOUD_PROJECT: '' }, { EMAIL_FROM: 'sender@example.test,OTHER=value' }]) test(`invalid binding inputs are rejected before any cloud call: ${Object.keys(overrides)[0]}`, () => {
  const result = run(overrides); assert.notEqual(result.status, 0); assert.equal(result.calls, ''); assert.equal(result.stdout, '');
});
test('deployment binds Preview mail separately and retains the Staging and Production boundaries', () => {
  const source = readFileSync(new URL('../scripts/deployment/deploy-cloud-run-environment.sh', import.meta.url), 'utf8');
  assert.match(source, /DEPLOYMENT_ENVIRONMENT=preview bash scripts\/deployment\/resolve-preview-email-config\.sh/);
  assert.ok(source.indexOf('Refusing to deploy to the production project.') < source.indexOf('resolve-preview-email-config.sh'));
  assert.match(source, /if \[\[ -n "\$preview_email_from" \]\]; then[\s\S]*?RESEND_API_KEY=RESEND_API_KEY:latest/);
  assert.match(source, /if \[\[ "\$environment" == "staging" \]\]; then/);
  assert.match(source, /NEXT_PUBLIC_SITE_URL=\$\{frontend_url\}/);
});
