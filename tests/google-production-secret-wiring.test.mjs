import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production readiness injects every required Google and identity value', async () => {
  const [workflow, contract] = await Promise.all([
    read('.github/workflows/google-production-readiness.yml'),
    read('.env.production')
  ]);
  const required = [...contract.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)]
    .map((match) => match[1])
    .filter((name) => name !== 'GOOGLE_APPLICATION_CREDENTIALS');
  const gate = workflow.split('- name: Block release unless all production values are injected')[1]
    ?.split('        run: |')[0] ?? '';
  const webBuild = workflow.split('- name: Build Web with protected Firebase configuration')[1]
    ?.split('        run:')[0] ?? '';

  for (const name of required) {
    assert.ok(gate.includes(`          ${name}: ` + '${{'), `${name} is not injected into the production gate`);
  }
  assert.match(gate, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: \$\{\{ secrets\.GOOGLE_MAPS_BROWSER_API_KEY \}\}/);
  assert.match(gate, /RESEND_API_KEY: \$\{\{ secrets\.RESEND_API_KEY \}\}/);
  assert.match(gate, /EMAIL_FROM: \$\{\{ vars\.EMAIL_FROM \}\}/);
  assert.equal((gate.match(/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:/g) ?? []).length, 1);
  assert.match(webBuild, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: \$\{\{ secrets\.GOOGLE_MAPS_BROWSER_API_KEY \}\}/);
});

test('production configuration accepts only the approved media location', async () => {
  const contract = await read('.env.production');
  const names = [...contract.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]);
  const productionEnv = Object.fromEntries(
    names.map((name) => [name, name.endsWith('_ENABLED') ? 'true' : 'injected-value']),
  );
  productionEnv.GCS_MEDIA_LOCATION = 'europe-west1';
  productionEnv.GOOGLE_CLOUD_REGION = 'europe-west1';

  assert.match(contract, /^GOOGLE_CLOUD_REGION=europe-west1$/m);

  assert.doesNotThrow(() => execFileSync(
    process.execPath,
    ['scripts/validate-google-config.mjs', '--production'],
    { encoding: 'utf8', env: productionEnv },
  ));
  assert.throws(
    () => execFileSync(
      process.execPath,
      ['scripts/validate-google-config.mjs', '--production'],
      { encoding: 'utf8', env: { ...productionEnv, GCS_MEDIA_LOCATION: 'US' } },
    ),
    /GCS_MEDIA_LOCATION must be europe-west1/,
  );
  assert.throws(
    () => execFileSync(
      process.execPath,
      ['scripts/validate-google-config.mjs', '--production'],
      { encoding: 'utf8', env: { ...productionEnv, GOOGLE_CLOUD_REGION: 'me-central1' } },
    ),
    /GOOGLE_CLOUD_REGION must be europe-west1/,
  );
});
