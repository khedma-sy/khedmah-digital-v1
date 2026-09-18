import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const deploy = await readFile(new URL('../scripts/deployment/deploy-cloud-run-environment.sh', import.meta.url), 'utf8');
const billing = await readFile(new URL('../scripts/deployment/ensure-billing-nonproduction-schema.sh', import.meta.url), 'utf8');

test('preview and staging apply canonical migrations through 034 in dependency order', () => {
  const m31 = deploy.indexOf('ensure-taxi-operational-nonproduction-schema.sh');
  const m32 = deploy.indexOf('ensure-taxi-operational-profile-gate-nonproduction-schema.sh');
  const m34 = deploy.indexOf('ensure-food-promotions-nonproduction-schema.sh');
  assert.ok(m31 >= 0 && m32 > m31 && m34 > m32);
  assert.match(deploy, /APPLY_KHEDMAH_NONPROD_032_/);
  assert.match(billing, /033_billing_admin_role\.sql/);
  assert.match(billing, /Billing migrations 030 and 033/);
});

test('nonproduction deployment keeps candidate Taxi trips disabled', () => {
  assert.match(deploy, /TAXI_TRIPS_ENABLED must be literal true or false/);
  assert.match(deploy, /Taxi trips cannot be enabled by this deployment path while the Taxi SQL remains candidate-only/);
});
