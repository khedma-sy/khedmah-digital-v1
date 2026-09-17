import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production migrations remain main-locked, backed up, checksum-bound and serialized', async () => {
  const [workflow, runner, migration, rollback, build, dockerfile] = await Promise.all([
    read('.github/workflows/production-operator.yml'),
    read('scripts/run-production-migration.sh'),
    read('backend/migrations/versions/022_expand_category_taxonomy.sql'),
    read('backend/migrations/versions/022_expand_category_taxonomy_rollback.sql'),
    read('cloudbuild.migration.yaml'),
    read('Dockerfile.migrations')
  ]);

  for (const number of ['021','022','024','025','026','027','028','029','030','031','032','033','034']) {
    assert.match(workflow, new RegExp(`APPLY_MIGRATION_${number}`));
    assert.match(runner, new RegExp(`${number}_[a-z0-9_]+`));
  }
  assert.match(workflow, /sha256sum "\$MIGRATION_FILE"/);
  assert.match(workflow, /MIGRATION_SHA256=\$MIGRATION_SHA256/);
  assert.match(workflow, /APPLY_KHEDMAH_MIGRATION_\$\{MIGRATION_NUMBER\}_/);
  assert.match(workflow, /EXPECTED_BACKUP_ID: \$\{\{ inputs\.backup_id \}\}/);
  assert.match(workflow, /gcloud sql backups describe/);
  assert.match(workflow, /test "\$BACKUP_STATUS" = SUCCESSFUL/);
  assert.match(workflow, /khedmah-before-\$\{MIGRATION_NUMBER\}-/);
  assert.match(workflow, /BACKUP_AGE_SECONDS/);
  assert.match(workflow, /git fetch origin main/);
  assert.match(workflow, /test "\$REQUESTED_SHA" = "\$MAIN_SHA"/);
  assert.match(workflow, /--max-retries[= ]0/);
  assert.match(workflow, /--set-cloudsql-instances/);
  assert.match(workflow, /DATABASE_URL=DATABASE_URL:latest/);
  assert.match(workflow, /gcloud run jobs execute/);

  assert.match(runner, /ACTUAL_SHA256="\$\(sha256sum "\$MIGRATION_FILE"/);
  assert.match(runner, /Migration checksum mismatch/);
  assert.match(runner, /pg_advisory_lock/);
  assert.match(runner, /pg_advisory_xact_lock/);
  assert.match(runner, /MIGRATION_022_ORGANIZATIONS_COMPATIBILITY_MISSING/);
  assert.match(runner, /MIGRATION_022_NONCANONICAL_ACTIVE_POSTCONDITION_FAILED/);
  assert.match(runner, /MIGRATION_022_BEFORE_IMAGE_POSTCONDITION_FAILED/);
  assert.match(runner, /MIGRATION_032_APPLIED_AND_VERIFIED/);
  assert.match(runner, /MIGRATION_033_APPLIED_AND_VERIFIED/);
  assert.match(runner, /MIGRATION_034_APPLIED_AND_VERIFIED/);
  assert.match(runner, /billing_admin/);
  assert.match(runner, /food_promo_codes/);
  assert.match(runner, /b\.trust_status <> 'approved'/);

  assert.match(migration, /CREATE TABLE category_taxonomy_022_before_image/);
  assert.match(migration, /INSERT INTO category_taxonomy_022_before_image/);
  assert.match(rollback, /UPDATE categories AS category[\s\S]*FROM category_taxonomy_022_before_image AS before_image/);
  assert.match(rollback, /MIGRATION_022_ROLLBACK_BEFORE_IMAGE_MISSING/);
  assert.match(rollback, /MIGRATION_022_ROLLBACK_NEW_CATEGORY_REFERENCED/);
  assert.match(rollback, /DROP TABLE category_taxonomy_022_before_image/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN.*organization_id/);
  assert.match(build, /Dockerfile\.migrations/);
  assert.match(dockerfile, /postgres:16-alpine/);
});

test('production operator maps every post-024 migration to its canonical file', async () => {
  const workflow = await read('.github/workflows/production-operator.yml');
  const mappings = {
    '025': '025_classifieds',
    '026': '026_cash_fulfillment_orders',
    '027': '027_mobility_document_reviews',
    '028': '028_platform_notifications',
    '029': '029_taxi_pricing_revisions',
    '030': '030_billing_credits_subscriptions',
    '031': '031_taxi_operational_approvals',
    '032': '032_taxi_operational_profile_gate',
    '033': '033_billing_admin_role',
    '034': '034_food_order_promotions'
  };
  for (const [number, version] of Object.entries(mappings)) {
    assert.match(workflow, new RegExp(`APPLY_MIGRATION_${number}\\) MIGRATION_NUMBER=${number}; MIGRATION_VERSION=${version}`));
  }
});
