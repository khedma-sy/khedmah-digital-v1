import assert from 'node:assert/strict';
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

  for (const name of required) {
    assert.ok(gate.includes(`          ${name}: ` + '${{'), `${name} is not injected into the production gate`);
  }
  assert.match(gate, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: \$\{\{ secrets\.GOOGLE_MAPS_BROWSER_API_KEY \}\}/);
  assert.match(gate, /RESEND_API_KEY: \$\{\{ secrets\.RESEND_API_KEY \}\}/);
  assert.match(gate, /EMAIL_FROM: \$\{\{ vars\.EMAIL_FROM \}\}/);
});
