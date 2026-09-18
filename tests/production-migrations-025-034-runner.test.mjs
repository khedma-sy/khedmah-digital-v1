import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../scripts/run-production-migrations-025-034.sh', import.meta.url), 'utf8');

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
  assert.match(source, /MIGRATION_NUMBER" = '033'/);
  assert.match(source, /MIGRATION_NUMBER" = '034'/);
  assert.match(source, /MIGRATION_\$\{MIGRATION_NUMBER\}_POSTCONDITION_FAILED/);
});
