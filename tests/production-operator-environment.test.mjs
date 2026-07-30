import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('production operator is an authentication-only manual workflow', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-production-operator.mjs'], { encoding: 'utf8' });
  assert.match(output, /Production operator contract valid/);
});

test('production operator contains no deployment command', () => {
  const workflow = execFileSync('cat', ['.github/workflows/production-operator.yml'], { encoding: 'utf8' });
  assert.doesNotMatch(workflow, /gcloud run deploy|gcloud builds submit|firebase deploy|terraform apply/);
});
