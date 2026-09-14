import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [runner, ensure, deploy, dockerfile, cloudbuild] = await Promise.all([
  read('scripts/deployment/run-billing-nonproduction-migration.sh'),
  read('scripts/deployment/ensure-billing-nonproduction-schema.sh'),
  read('scripts/deployment/deploy-cloud-run-environment.sh'),
  read('Dockerfile.billing-migration'),
  read('cloudbuild.billing-migration.yaml')
]);

test('Billing 030 is preview/staging only, checksum-bound and fails closed on partial state', () => {
  for (const required of [
    '030_billing_credits_subscriptions',
    'd758036cbcf20fbcee176c9ea7ba097564142de839b609b22a5cb469d6335194',
    '88795ee75d9948e5ecf85d8c2d53f6b77397b52b',
    'Refusing Billing migration 030 against the production project',
    'partial_or_unverified',
    "pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-billing-030',0))",
    'SYP_NEW_2026',
    'KHEDMA30'
  ]) assert.match(runner, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(runner, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/i);
});

test('Billing 030 deployment gate runs before backend build and retains production refusal', () => {
  assert.match(ensure, /Refusing Billing schema operation on the production project/);
  assert.match(ensure, /BILLING_030_FAILED_EXECUTION/);
  assert.match(ensure, /cloudbuild\.billing-migration\.yaml/);
  const gate = deploy.indexOf('ensure-billing-nonproduction-schema.sh');
  const backend = deploy.indexOf('cloudbuild.${environment}-backend.yaml');
  assert.ok(gate >= 0 && backend > gate);
  assert.match(deploy, /APPLY_KHEDMAH_NONPROD_030_\$\{environment\^\^\}/);
  assert.match(dockerfile, /030_billing_credits_subscriptions\.sql/);
  assert.match(cloudbuild, /Dockerfile\.billing-migration/);
});
