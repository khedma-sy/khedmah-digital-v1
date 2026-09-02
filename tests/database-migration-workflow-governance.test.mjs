import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('database migration workflow governs every canonical pair through 031', async () => {
  const workflow = await read('.github/workflows/database-migration-check.yml');

  const names = [
    '001_core_identity_accounts', '002_create_profiles', '003_create_professional_profiles',
    '004_analytics_and_contact', '005_email_verifications_and_admin_roles', '006_media_assets',
    '007_v2_marketplace', '008_provider_service_radius', '009_canonical_identity_runtime',
    '010_canonical_runtime_domains', '011_canonical_media_contract', '012_nearby_preferences',
    '013_nearby_notifications_read_state', '014_supplier_discovery', '015_contact_target_contract',
    '016_contact_submission_idempotency', '017_category_taxonomy_contract',
    '018_persistent_rate_limit_buckets',
    '019_remove_out_of_scope_subscription_schema',
    '020_identity_recovery_oauth', '021_provider_reports',
    '022_expand_category_taxonomy', '024_product_store', '025_mobility_requests',
    '026_cash_fulfillment_orders', '027_professional_service_marketplace', '028_khedmah_promotions',
    '029_admin_user_management', '030_operations_issue_center', '031_admin_catalog_management'
  ];
  for (const name of names) {
    assert.match(workflow, new RegExp(`^\\s+${name}$`, 'm'));
    assert.match(workflow, new RegExp(`^\\s+${name}\\.sql \\\\$`, 'm'));
    assert.match(workflow, new RegExp(`^\\s+${name}_rollback\\.sql \\\\$`, 'm'));
  }
});
