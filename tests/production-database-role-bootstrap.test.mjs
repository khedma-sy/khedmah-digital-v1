import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/production-database-role-bootstrap.yml', import.meta.url), 'utf8');
const wif = await readFile(new URL('../infra/iac/production_operator.tf', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../scripts/bootstrap-new-production-project.sh', import.meta.url), 'utf8');

test('production database role bootstrap is manual, exact-main and migration-identity only', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /OPERATIONS_MIGRATION_SERVICE_ACCOUNT/);
  assert.match(workflow, /DATABASE_URL=DATABASE_MIGRATION_URL:latest/);
  assert.match(workflow, /--service-account "\$OPERATIONS_MIGRATION_SERVICE_ACCOUNT"/);
  assert.doesNotMatch(workflow, /--service-account "\$OPERATIONS_RUNTIME_SERVICE_ACCOUNT"/);
  assert.match(workflow, /--max-retries 0/);
});

test('prepare and harden require explicit commit-bound confirmations', () => {
  assert.match(workflow, /PREPARE_KHEDMAH_DATABASE_ROLES_/);
  assert.match(workflow, /HARDEN_KHEDMAH_DATABASE_ROLES_/);
  assert.match(workflow, /DATABASE_ROLE_PHASE=prepare/);
  assert.match(workflow, /DATABASE_ROLE_PHASE=harden/);
  assert.match(workflow, /DATABASE_ROLE_PHASE=verify/);
});

test('production WIF and bootstrap trust include the database role workflow on main', () => {
  assert.match(wif, /production-database-role-bootstrap\.yml@refs\/heads\/main/);
  assert.match(bootstrap, /production-database-role-bootstrap\.yml/);
});


test('prepare replaces Cloud SQL superuser membership with custom roles and re-verifies', async () => {
  const bootstrapTerraform = await readFile(new URL('../infra/iac/bootstrap/main.tf', import.meta.url), 'utf8');
  assert.match(workflow, /gcloud sql users assign-roles "\$DATABASE_RUNTIME_USER"/);
  assert.match(workflow, /gcloud sql users assign-roles "\$DATABASE_MIGRATION_USER"/);
  assert.match(workflow, /--revoke-existing-roles/);
  assert.match(workflow, /DATABASE_ROLE_PHASE=verify/);
  assert.match(bootstrapTerraform, /cloudsql\.users\.update/);
  assert.doesNotMatch(bootstrapTerraform, /roles\/cloudsql\.admin/);
});


test('legacy broad runtime hardening path stays retired', async () => {
  const legacy = await readFile(new URL('../scripts/harden-production-runtime-database.sh', import.meta.url), 'utf8');
  assert.match(legacy, /legacy runtime hardening path is retired/);
  assert.match(legacy, /Production Database Role Bootstrap workflow in HARDEN mode/);
  assert.doesNotMatch(legacy, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES/);
});


test('production hardening preserves Taxi trip least privilege without tariff or delete rights', async () => {
  const script = await readFile(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url), 'utf8');
  assert.match(script, /jt_quotes/);
  assert.match(script, /jt_orders/);
  assert.match(script, /jt_evidence/);
  assert.match(script, /jt_outbox/);
  assert.match(script, /read_tariff_locked\(TEXT\)/);
  assert.match(script, /read_route_locked\(TEXT, TEXT\)/);
  assert.match(script, /UPDATE\(consumed_order_id\)/);
  assert.match(script, /UPDATE\(consumed_event_id\)/);
  assert.match(script, /NOT has_table_privilege\('\$RUNTIME_USER','khedmah_taxi\.tariffs','UPDATE'\)/);
  assert.match(script, /NOT has_table_privilege\('\$RUNTIME_USER','khedmah_taxi\.routes','UPDATE'\)/);
  assert.match(script, /NOT has_table_privilege\('\$RUNTIME_USER','khedmah_taxi\.jt_events','DELETE'\)/);
  assert.match(script, /NOT has_table_privilege\('\$RUNTIME_USER','khedmah_taxi\.jt_cash_receipts','DELETE'\)/);
});


test('Taxi approval table updates stay column-scoped in production hardening', async () => {
  const script = await readFile(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url), 'utf8');
  assert.match(script, /GRANT SELECT, INSERT ON TABLE[\s\S]*driver_approvals[\s\S]*vehicle_approvals/);
  assert.match(script, /GRANT UPDATE\([\s\S]*status[\s\S]*reviewed_by[\s\S]*\) ON khedmah_taxi\.driver_approvals/);
  assert.match(script, /GRANT UPDATE\([\s\S]*status[\s\S]*reviewed_by[\s\S]*\) ON khedmah_taxi\.vehicle_approvals/);
  assert.doesNotMatch(script, /GRANT SELECT, INSERT, UPDATE ON TABLE[\s\S]*driver_approvals/);
  assert.match(script, /NOT has_column_privilege\('\$RUNTIME_USER','khedmah_taxi\.driver_approvals','user_id','UPDATE'\)/);
  assert.match(script, /NOT has_column_privilege\('\$RUNTIME_USER','khedmah_taxi\.vehicle_approvals','id','UPDATE'\)/);
});
