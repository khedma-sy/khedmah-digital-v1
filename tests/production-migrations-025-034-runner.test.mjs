import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../scripts/run-production-migrations-025-034.sh', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/production-migrations-025-034.yml', import.meta.url), 'utf8');

test('production migration runner is checksum-bound and lineage ordered through 034', () => {
  assert.match(source, /MIGRATION_SHA256 must be a lowercase SHA-256/);
  assert.match(source, /sha256sum -c -/);
  for (const number of ['025','026','027','028','029','030','031','032','033','034']) {
    assert.match(source, new RegExp(`\\b${number}\\)\\s+MIGRATION_NAME=`));
  }
  for (const predecessor of [
    "to_regclass('public.product_listings') IS NOT NULL",
    "to_regclass('public.ad_listings') IS NOT NULL",
    "to_regclass('public.fulfillment_orders') IS NOT NULL",
    "to_regclass('public.mobility_document_reviews') IS NOT NULL",
    "to_regclass('public.platform_notifications') IS NOT NULL",
    "to_regclass('public.taxi_pricing_revisions') IS NOT NULL",
    "to_regclass('public.billing_program_config') IS NOT NULL",
    "to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL"
  ]) assert.ok(source.includes(predecessor), `missing predecessor: ${predecessor}`);
  assert.match(source, /MIGRATION_\$\{MIGRATION_NUMBER\}_PREDECESSOR_MISSING/);
});

test('migration 032 distinguishes the unhardened 031 function from the applied 032 function', () => {
  const section = source.split("032)")[1]?.split("033)")[0] ?? '';
  assert.match(section, /FROM public\.business_profiles bb/);
  assert.match(section, /b\.trust_status <> 'approved'/);
  assert.match(section, /b\.moderation_status <> 'approved'/);
  assert.match(section, /THEN 1 ELSE NULL END/);
  assert.doesNotMatch(section, /ELSE position\([^\n]+\) END/);
});

test('migration execution is serialized and reviewed files 033/034 keep their internal transactions', () => {
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /pg_advisory_lock/);
  assert.match(source, /DATABASE_ROLE_ISOLATION_SAFE_SQL=/);
  assert.match(source, /PRODUCTION_DATABASE_ROLE_ISOLATION_NOT_READY/);
  assert.match(source, /membership\.inherit_option/);
  assert.match(source, /membership\.set_option/);
  assert.match(source, /NOT membership\.admin_option/);
  assert.match(source, /MIGRATION_NUMBER" = '033'/);
  assert.match(source, /MIGRATION_NUMBER" = '034'/);
  assert.match(source, /MIGRATION_\$\{MIGRATION_NUMBER\}_POSTCONDITION_FAILED/);
});

test('migration lineage and replay guards are repeated after acquiring the shared lock', () => {
  const transactionLock = source.indexOf("pg_advisory_xact_lock(hashtextextended('khedmah-production-schema-change', 0))");
  const sessionLock = source.indexOf("pg_advisory_lock(hashtextextended('khedmah-production-schema-change', 0))");
  for (const lockIndex of [transactionLock, sessionLock]) {
    const guardIndex = source.indexOf("RAISE EXCEPTION 'MIGRATION_${MIGRATION_NUMBER}_PREDECESSOR_MISSING'", lockIndex);
    const includeIndex = source.indexOf('\\ir ${MIGRATION_FILE}', lockIndex);
    assert.ok(lockIndex >= 0 && guardIndex > lockIndex && includeIndex > guardIndex);
  }
});


test('025-034 workflow uses only the dedicated migration identity and elevated database secret', () => {
  assert.match(workflow, /OPERATIONS_MIGRATION_SERVICE_ACCOUNT/);
  assert.match(workflow, /--service-account "\$OPERATIONS_MIGRATION_SERVICE_ACCOUNT"/);
  assert.match(workflow, /gcloud secrets versions describe active --secret DATABASE_MIGRATION_URL/);
  assert.match(workflow, /DATABASE_URL=DATABASE_MIGRATION_URL:active/);
  assert.doesNotMatch(workflow, /gcloud secrets versions describe latest --secret DATABASE_MIGRATION_URL/);
  assert.doesNotMatch(workflow, /DATABASE_URL=DATABASE_MIGRATION_URL:latest/);
  assert.doesNotMatch(workflow, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT/);
  assert.doesNotMatch(workflow, /DATABASE_URL=DATABASE_URL:latest/);
});

test('025-034 verifies the committed migration secret alias before backup evidence and build mutation', () => {
  const alias = workflow.indexOf('gcloud secrets versions describe active --secret DATABASE_MIGRATION_URL');
  const backup = workflow.indexOf('gcloud sql backups describe');
  const build = workflow.indexOf('gcloud builds submit');
  assert.ok(alias >= 0 && backup > alias && build > backup);
});

test('025-034 backup and migration target are scoped to the protected project and region', () => {
  const target = workflow.split('- name: Verify production target and recent backup')[1]
    ?.split('- name: Build checksum-bound migration image')[0] ?? '';
  const guard = '[[ "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" == "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]]';
  const guardIndex = target.indexOf(guard);
  const instanceIndex = target.indexOf('SQL_INSTANCE_NAME="${CLOUD_SQL_INSTANCE_CONNECTION_NAME##*:}"');
  const backupIndex = target.indexOf('gcloud sql backups describe');
  assert.ok(guardIndex >= 0, 'Cloud SQL target must be bound to the active project and region');
  assert.ok(
    instanceIndex > guardIndex && backupIndex > instanceIndex,
    'scope guard must precede instance extraction and backup proof',
  );
});
