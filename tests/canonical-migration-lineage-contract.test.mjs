import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationsUrl = new URL('../backend/migrations/versions/', import.meta.url);
const read = (name) => readFile(new URL(name, migrationsUrl), 'utf8');

test('canonical migrations form one governed forward and rollback lineage through 019', async () => {
  const files = await readdir(migrationsUrl);
  for (let version = 1; version <= 19; version += 1) {
    const prefix = String(version).padStart(3, '0');
    const forward = files.filter((name) => name.startsWith(`${prefix}_`) && !name.endsWith('_rollback.sql'));
    const rollback = files.filter((name) => name.startsWith(`${prefix}_`) && name.endsWith('_rollback.sql'));
    assert.equal(forward.length, 1, `expected one forward migration for ${prefix}`);
    assert.equal(rollback.length, 1, `expected one rollback migration for ${prefix}`);
  }
});

test('recovered migrations own the runtime anchors attributed to them', async () => {
  const contracts = {
    '009_canonical_identity_runtime.sql': ['identity_credentials', 'identity_sessions', 'audit_logs'],
    '010_canonical_runtime_domains.sql': ['locations', 'organizations', 'roles', 'permissions', 'professional_profiles'],
    '011_canonical_media_contract.sql': ['media_assets', 'asset_type'],
    '012_nearby_preferences.sql': ['nearby_preferences', 'coverage_radius'],
    '013_nearby_notifications_read_state.sql': ['nearby_notifications', 'read_at', 'nearby_notifications_user_idempotency_idx'],
    '014_supplier_discovery.sql': ['supplier_capabilities', 'coverage_location_identifier'],
    '015_contact_target_contract.sql': ['professional_profile_id', 'contact_inquiries_exactly_one_target_check', 'contact_inquiries_tracking_status_check']
  };
  for (const [file, anchors] of Object.entries(contracts)) {
    const sql = await read(file);
    for (const anchor of anchors) assert.match(sql, new RegExp(anchor));
  }
});

test('active runtime repositories use canonical identity, professional and contact names', async () => {
  const [identity, professional, contact] = await Promise.all([
    readFile(new URL('../apps/backend/src/identity/identity.repository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/backend/src/professional-profiles/professional-profile.repository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/backend/src/contact/contact.repository.ts', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(identity, /\b(?:user_accounts|user_profiles|user_sessions)\b/);
  assert.doesNotMatch(professional, /professional_directory_profiles/);
  assert.doesNotMatch(contact, /\bcontact_actions\b/);
});
