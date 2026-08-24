#!/usr/bin/env node
/**
 * Production Database Readiness Validation
 * Does NOT deploy or modify any production system.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const isProduction = process.argv.includes('--production');
const MIGRATIONS_DIR = resolve(import.meta.dirname ?? '.', '../backend/migrations/versions');
const EXPECTED_MIGRATIONS = [
  '001_core_identity_accounts.sql','001_core_identity_accounts_rollback.sql',
  '002_create_profiles.sql','002_create_profiles_rollback.sql',
  '003_create_professional_profiles.sql','003_create_professional_profiles_rollback.sql',
  '004_analytics_and_contact.sql','004_analytics_and_contact_rollback.sql',
  '005_email_verifications_and_admin_roles.sql','005_email_verifications_and_admin_roles_rollback.sql',
  '006_media_assets.sql','006_media_assets_rollback.sql',
  '007_v2_marketplace.sql','007_v2_marketplace_rollback.sql',
  '008_provider_service_radius.sql','008_provider_service_radius_rollback.sql',
  '009_canonical_identity_runtime.sql','009_canonical_identity_runtime_rollback.sql',
  '010_canonical_runtime_domains.sql','010_canonical_runtime_domains_rollback.sql',
  '011_canonical_media_contract.sql','011_canonical_media_contract_rollback.sql',
  '012_nearby_preferences.sql','012_nearby_preferences_rollback.sql',
  '013_nearby_notifications_read_state.sql','013_nearby_notifications_read_state_rollback.sql',
  '014_supplier_discovery.sql','014_supplier_discovery_rollback.sql',
  '015_contact_target_contract.sql','015_contact_target_contract_rollback.sql',
  '016_contact_submission_idempotency.sql','016_contact_submission_idempotency_rollback.sql',
  '017_category_taxonomy_contract.sql','017_category_taxonomy_contract_rollback.sql',
  '018_persistent_rate_limit_buckets.sql','018_persistent_rate_limit_buckets_rollback.sql',
  '019_remove_out_of_scope_subscription_schema.sql','019_remove_out_of_scope_subscription_schema_rollback.sql',
  '020_identity_recovery_oauth.sql','020_identity_recovery_oauth_rollback.sql'
];

const REQUIRED_ENV_KEYS = ['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'];
const PRODUCTION_ADDITIONAL_ENV = ['DATABASE_URL','BOOTSTRAP_ADMIN_SECRET'];
let passed = 0;
let failed = 0;

function check(label, condition, fatal = false) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else {
    console.error(`  ❌ ${label}`); failed++;
    if (fatal) { console.error('\nFATAL: Aborting validation.'); process.exit(1); }
  }
}
function warn(label) { console.warn(`  ⚠️  ${label}`); }

console.log('\n========================================');
console.log('  PRODUCTION DATABASE READINESS CHECK');
console.log(`  Mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
console.log('========================================\n');

console.log('1. Migration files:');
for (const filename of EXPECTED_MIGRATIONS) check(filename, existsSync(join(MIGRATIONS_DIR, filename)));

console.log('\n2. Migration content validation:');
for (const filename of EXPECTED_MIGRATIONS) {
  if (filename.includes('rollback')) continue;
  const filepath = join(MIGRATIONS_DIR, filename);
  if (!existsSync(filepath)) continue;
  const content = readFileSync(filepath, 'utf8');
  if (filename.startsWith('019_')) check(`${filename} has teardown DDL`, /\bDROP\s+TABLE\b/.test(content));
  else check(`${filename} has schema DDL`, /\b(?:CREATE|ALTER)\s+TABLE\b/.test(content));
  check(`${filename} has rollback script`, existsSync(join(MIGRATIONS_DIR, filename.replace('.sql', '_rollback.sql'))));
}

console.log('\n3. PostgreSQL environment variables:');
for (const key of REQUIRED_ENV_KEYS) process.env[key] ? check(key, true) : warn(`${key} is not set (required for live database connection)`);

if (isProduction) {
  console.log('\n4. Production-only environment variables:');
  for (const key of PRODUCTION_ADDITIONAL_ENV) check(key, Boolean(process.env[key]));
}

console.log('\n5. Secrets sanity:');
const bootstrapSecret = process.env.BOOTSTRAP_ADMIN_SECRET;
if (bootstrapSecret) {
  check('BOOTSTRAP_ADMIN_SECRET length >= 32', bootstrapSecret.length >= 32);
  check('BOOTSTRAP_ADMIN_SECRET not a default value', !['changeme', 'secret', 'password'].includes(bootstrapSecret));
} else warn('BOOTSTRAP_ADMIN_SECRET not set (acceptable if bootstrap is complete)');

if (isProduction) {
  check('EMAIL_FROM is configured', Boolean(process.env.EMAIL_FROM));
  check('RESEND_API_KEY is configured', Boolean(process.env.RESEND_API_KEY));
  check('FIREBASE_API_KEY is configured for server token verification', Boolean(process.env.FIREBASE_API_KEY));
} else warn('Production email/Firebase secrets are not required in development mode');

console.log('\n6. Rate limiting configuration:');
if (process.env.RATE_LIMIT_AUTH_WINDOW_MS && process.env.RATE_LIMIT_AUTH_MAX) {
  check('RATE_LIMIT_AUTH_WINDOW_MS is set', true);
  check('RATE_LIMIT_AUTH_MAX is set', true);
} else warn('Rate limit env vars not set — defaults will be used');

console.log('\n========================================');
console.log(`  SUMMARY: ${passed} passed, ${failed} failed`);
console.log('========================================\n');
if (failed > 0) process.exit(1);
console.log('Database readiness check PASSED.\n');
