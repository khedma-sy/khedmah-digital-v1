import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Migration 016 owns a scoped race-safe Contact idempotency record', async () => {
  const sql = await read('backend/migrations/versions/016_contact_submission_idempotency.sql');
  for (const field of ['submitter_user_id', 'idempotency_key', 'inquiry_id', 'payload_fingerprint', 'created_at']) assert.match(sql, new RegExp(`\\b${field}\\b`));
  assert.match(sql, /CONSTRAINT contact_submission_idempotency_submitter_key_unique UNIQUE \(submitter_user_id, idempotency_key\)/);
  assert.match(sql, /REFERENCES contact_inquiries\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /message|contact_email|inventory|payment|order/i);
});

test('Migration 016 rollback removes only its owned table', async () => {
  const rollback = await read('backend/migrations/versions/016_contact_submission_idempotency_rollback.sql');
  assert.match(rollback, /DROP TABLE IF EXISTS contact_submission_idempotency/);
  assert.doesNotMatch(rollback, /DROP TABLE IF EXISTS contact_inquiries|ALTER TABLE contact_inquiries/i);
});

test('Contact repository binds inquiry and idempotency marker in one transaction', async () => {
  const repository = await read('apps/backend/src/contact/contact.repository.ts');
  assert.match(repository, /this\.db\.transaction/);
  assert.match(repository, /contact_submission_idempotency_submitter_key_unique/);
  assert.match(repository, /WHERE i\.submitter_user_id=\$1 AND i\.idempotency_key=\$2/);
  assert.match(repository, /professional_profile_id/);
});

test('startup requires the critical Migration 016 uniqueness anchor', async () => {
  const migrator = await read('apps/backend/src/database/database.migrator.ts');
  assert.match(migrator, /REQUIRED_CANONICAL_SCHEMA_VERSION = '025'/);
  assert.match(migrator, /contact_submission_idempotency_submitter_key_unique/);
});
