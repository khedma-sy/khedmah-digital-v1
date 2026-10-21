import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';

const migration = (name: string) => readFile(
  resolve(__dirname, '../../../../backend/migrations/versions', name),
  'utf8'
);

test('migration 037 admits only private evidence on the matching profile type and rolls back safely', { timeout: 60_000 }, async () => {
  const pool = createTestPool();
  try {
    await resetCanonicalTestSchema(pool);
    await pool.query(
      `INSERT INTO core_user_accounts
         (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
       VALUES ('verification_migration_owner','identity_verification_migration_owner','individual_user','active','active','private')`
    );
    await pool.query(await migration('037_verification_evidence_media.sql'));

    const insertEvidence = (
      id: string,
      ownerType: 'business_profile' | 'professional_profile',
      visibility: 'public' | 'private',
      assetType: 'business_verification_evidence' | 'professional_verification_evidence'
    ) => pool.query(
      `INSERT INTO media_assets
         (id,owner_user_id,owner_type,owner_id,filename,mime_type,size_bytes,visibility,storage_key,asset_type)
       VALUES ($1,'verification_migration_owner',$2,$1,'proof.png','image/png',8,$3,$1,$4)`,
      [id, ownerType, visibility, assetType]
    );

    await insertEvidence('valid-business-evidence', 'business_profile', 'private', 'business_verification_evidence');
    await insertEvidence('valid-professional-evidence', 'professional_profile', 'private', 'professional_verification_evidence');
    await assert.rejects(
      insertEvidence('public-business-evidence', 'business_profile', 'public', 'business_verification_evidence'),
      (error: unknown) => (error as { constraint?: string }).constraint === 'media_assets_verification_evidence_private_check'
    );
    await assert.rejects(
      insertEvidence('mismatched-business-evidence', 'professional_profile', 'private', 'business_verification_evidence'),
      (error: unknown) => (error as { constraint?: string }).constraint === 'media_assets_verification_evidence_private_check'
    );

    await assert.rejects(
      pool.query(await migration('037_verification_evidence_media_rollback.sql')),
      /MIGRATION_037_ROLLBACK_BLOCKED/
    );
    await pool.query(
      `DELETE FROM media_assets
       WHERE asset_type IN ('business_verification_evidence','professional_verification_evidence')`
    );
    await pool.query(await migration('037_verification_evidence_media_rollback.sql'));
    await assert.rejects(
      insertEvidence('evidence-after-rollback', 'business_profile', 'private', 'business_verification_evidence'),
      (error: unknown) => (error as { constraint?: string }).constraint === 'media_assets_asset_type_check'
    );
  } finally {
    await pool.end();
  }
});
