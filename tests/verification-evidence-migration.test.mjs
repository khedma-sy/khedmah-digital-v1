import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [forward, rollback, migrator, readiness, workflow] = await Promise.all([
  read('backend/migrations/versions/037_verification_evidence_media.sql'),
  read('backend/migrations/versions/037_verification_evidence_media_rollback.sql'),
  read('apps/backend/src/database/database.migrator.ts'),
  read('scripts/validate-database-readiness.mjs'),
  read('.github/workflows/database-migration-check.yml')
]);

test('migration 037 adds only matching private verification evidence media types', () => {
  assert.match(forward, /DROP CONSTRAINT media_assets_asset_type_check/);
  assert.match(forward, /business_verification_evidence/);
  assert.match(forward, /professional_verification_evidence/);
  assert.match(forward, /media_assets_verification_evidence_private_check/);
  assert.match(forward, /owner_type = 'business_profile' AND visibility = 'private'/);
  assert.match(forward, /owner_type = 'professional_profile' AND visibility = 'private'/);
  assert.doesNotMatch(forward, /\b(?:DELETE|UPDATE|TRUNCATE)\b/i);
});

test('migration 037 rollback blocks before narrowing when evidence exists', () => {
  const blocker = rollback.indexOf('MIGRATION_037_ROLLBACK_BLOCKED: verification evidence exists');
  const narrowing = rollback.indexOf('DROP CONSTRAINT media_assets_asset_type_check');
  assert.ok(blocker >= 0 && narrowing > blocker);
  assert.match(rollback, /DROP CONSTRAINT IF EXISTS media_assets_verification_evidence_private_check/);
  assert.doesNotMatch(rollback, /\b(?:DELETE|UPDATE|TRUNCATE)\b/i);
});

test('migration 037 is a required canonical schema anchor and governed pair', () => {
  assert.match(migrator, /REQUIRED_CANONICAL_SCHEMA_VERSION = '037'/);
  assert.match(migrator, /media_assets_asset_type_check_verification_evidence/);
  assert.match(migrator, /media_assets_verification_evidence_private_check/);
  assert.match(readiness, /037_verification_evidence_media\.sql/);
  assert.match(readiness, /037_verification_evidence_media_rollback\.sql/);
  assert.match(workflow, /^\s+037_verification_evidence_media$/m);
  assert.match(workflow, /^\s+037_verification_evidence_media\.sql \\/m);
  assert.match(workflow, /^\s+037_verification_evidence_media_rollback\.sql \\/m);
});
