import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const build = await readFile(new URL('../cloudbuild.production-new-account.yaml', import.meta.url), 'utf8');
const operator = await readFile(new URL('../.github/workflows/production-operator-new-account.yml', import.meta.url), 'utf8');

test('new-account Production injects runtime project, Firebase identity and telemetry state', () => {
  assert.match(build, /GOOGLE_CLOUD_PROJECT=\$PROJECT_ID/);
  assert.match(build, /GOOGLE_CLOUD_REGION=\$\{_REGION\}/);
  assert.match(build, /FIREBASE_PROJECT_ID=NEXT_PUBLIC_FIREBASE_PROJECT_ID:latest/);
  assert.match(build, /GOOGLE_LOGGING_ENABLED=\$\{_GOOGLE_LOGGING_ENABLED\}/);
  assert.match(build, /GOOGLE_MONITORING_ENABLED=\$\{_GOOGLE_MONITORING_ENABLED\}/);
  assert.match(build, /GOOGLE_ERROR_REPORTING_ENABLED=\$\{_GOOGLE_ERROR_REPORTING_ENABLED\}/);
});

test('Production telemetry flags fail closed and are passed from protected variables', () => {
  for (const name of [
    'GOOGLE_LOGGING_ENABLED',
    'GOOGLE_MONITORING_ENABLED',
    'GOOGLE_ERROR_REPORTING_ENABLED'
  ]) {
    assert.match(operator, new RegExp(`test "\\\$${name}" = true`));
    assert.match(operator, new RegExp(`_${name}=\\$${name}`));
    assert.match(build, new RegExp(`_${name}: REQUIRED_${name}`));
  }
  assert.match(build, /Production telemetry flags must all be true/);
});


test('Production Classifieds rollout is explicit and cannot expose frontend over a disabled backend', () => {
  assert.match(operator, /CLASSIFIEDS_ENABLED: \$\{\{ vars\.CLASSIFIEDS_ENABLED \}\}/);
  assert.match(operator, /NEXT_PUBLIC_CLASSIFIEDS_ENABLED: \$\{\{ vars\.NEXT_PUBLIC_CLASSIFIEDS_ENABLED \}\}/);
  assert.match(operator, /Frontend Classifieds cannot be enabled while Backend Classifieds is disabled/);
  assert.match(build, /_CLASSIFIEDS_ENABLED: REQUIRED_CLASSIFIEDS_ENABLED/);
  assert.match(build, /_NEXT_PUBLIC_CLASSIFIEDS_ENABLED: REQUIRED_NEXT_PUBLIC_CLASSIFIEDS_ENABLED/);
  assert.match(build, /NEXT_PUBLIC_CLASSIFIEDS_ENABLED='\$\{_NEXT_PUBLIC_CLASSIFIEDS_ENABLED\}'/);
  assert.match(build, /CLASSIFIEDS_ENABLED=\$\{_CLASSIFIEDS_ENABLED\}/);
  assert.match(build, /\[\[ "\$\$flag" == true \|\| "\$\$flag" == false \]\]/);
});
