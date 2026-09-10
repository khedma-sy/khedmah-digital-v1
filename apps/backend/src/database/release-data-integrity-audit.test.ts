import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabasePool } from './database.pool';
import { createTestPool, resetCanonicalTestSchema } from './test-pool';
import { auditReleaseDataIntegrity } from './release-data-integrity-audit';

test('release data integrity audit is deterministic and read-only', { timeout: 60_000 }, async () => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  try {
    await resetCanonicalTestSchema(pool);

    const clean = await auditReleaseDataIntegrity(db);
    assert.equal(clean.ok, true);
    assert.deepEqual(clean.findings, []);

    const owner = 'integrity_owner';
    const other = 'integrity_other';
    const business = 'integrity_business';
    const professional = 'professional_profile_integrity_1234';
    const profile = 'profile_integrity_1234';
    await db.query(
      `INSERT INTO core_user_accounts
         (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
       VALUES ($1,'identity_integrity_owner','individual_user','active','active','private'),
              ($2,'identity_integrity_other','individual_user','active','active','private')`,
      [owner, other]
    );
    const [category] = await db.query<{ code: string }>(
      `SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`
    );
    assert.ok(category);
    await db.query(
      `INSERT INTO business_profiles
         (id,name,owner_user_id,visibility,moderation_status,trust_status,status,category_code,city_code,country_code)
       VALUES ($1,'Integrity business',$2,'public','pending','pending','active',$3,'damascus','SY')`,
      [business, owner, category.code]
    );
    await db.query(
      `INSERT INTO profiles
         (profile_identifier,user_identifier,profile_type,display_name,lifecycle_status,visibility)
       VALUES ($1,$2,'professional_profile','Integrity professional','active','private')`,
      [profile, owner]
    );
    await db.query(
      `INSERT INTO professional_profiles
         (professional_profile_identifier,profile_identifier,user_identifier,profession_type,lifecycle_status,visibility,
          moderation_status,headline_ar,city_code,country_code)
       VALUES ($1,$2,$3,'consultant','active','public','pending','Integrity professional','damascus','SY')`,
      [professional, profile, owner]
    );

    await db.query(
      `INSERT INTO verification_requests
         (id,entity_type,entity_id,requester_id,status,created_at,updated_at)
       VALUES
         ('integrity-orphan-verification','business','missing-business',$1,'pending',clock_timestamp()-interval '4 minutes',clock_timestamp()-interval '4 minutes'),
         ('integrity-pending-one','business',$2,$3,'pending',clock_timestamp()-interval '3 minutes',clock_timestamp()-interval '3 minutes'),
         ('integrity-pending-two','business',$2,$3,'pending',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '2 minutes'),
         ('integrity-decided-without-reviewer','professional',$4,$1,'approved',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '1 minute')`,
      [owner, business, other, professional]
    );

    const mediaValues = [
      ['integrity-media-orphan', owner, 'business_profile', 'missing-business', 'orphan.webp', 'media/integrity/shared.webp'],
      ['integrity-media-user-mismatch', owner, 'user', other, 'mismatch.webp', 'media/integrity/shared.webp']
    ] as const;
    for (const [id, ownerUserId, ownerType, ownerId, filename, storageKey] of mediaValues) {
      await db.query(
        `INSERT INTO media_assets
           (id,owner_user_id,owner_type,owner_id,filename,mime_type,size_bytes,visibility,storage_key,public_url,asset_type,sort_order)
         VALUES ($1,$2,$3,$4,$5,'image/webp',64,'private',$6,NULL,NULL,0)`,
        [id, ownerUserId, ownerType, ownerId, filename, storageKey]
      );
    }

    await db.query(
      `INSERT INTO service_listings
         (id,owner_type,owner_id,title_ar,category_code,price_type,status)
       VALUES ('integrity-orphan-service','business','missing-business','Orphan service',$1,'negotiable','active')`,
      [category.code]
    );

    const before = await db.query<{ verifications: number; media: number; services: number }>(`
      SELECT
        (SELECT count(*)::int FROM verification_requests) AS verifications,
        (SELECT count(*)::int FROM media_assets) AS media,
        (SELECT count(*)::int FROM service_listings) AS services
    `);

    const report = await auditReleaseDataIntegrity(db);
    assert.equal(report.ok, false);
    const byCode = new Map(report.findings.map((finding) => [finding.code, finding]));
    assert.equal(byCode.get('ORPHAN_VERIFICATION_TARGET')?.count, 1);
    assert.equal(byCode.get('MULTIPLE_PENDING_VERIFICATION')?.count, 1);
    assert.equal(byCode.get('VERIFICATION_DECISION_METADATA_MISMATCH')?.count, 1);
    assert.equal(byCode.get('PENDING_VERIFICATION_REQUESTER_MISMATCH')?.count, 2);
    assert.equal(byCode.get('ORPHAN_MEDIA_OWNER')?.count, 1);
    assert.equal(byCode.get('MEDIA_OWNER_USER_MISMATCH')?.count, 1);
    assert.equal(byCode.get('DUPLICATE_MEDIA_STORAGE_KEY')?.count, 1);
    assert.equal(byCode.get('ORPHAN_SERVICE_OWNER')?.count, 1);
    assert.ok(byCode.get('ORPHAN_MEDIA_OWNER')?.sampleIds.includes('integrity-media-orphan'));
    assert.ok(byCode.get('ORPHAN_SERVICE_OWNER')?.sampleIds.includes('integrity-orphan-service'));

    const after = await db.query<{ verifications: number; media: number; services: number }>(`
      SELECT
        (SELECT count(*)::int FROM verification_requests) AS verifications,
        (SELECT count(*)::int FROM media_assets) AS media,
        (SELECT count(*)::int FROM service_listings) AS services
    `);
    assert.deepEqual(after, before, 'release integrity audit must never mutate application data');
  } finally {
    await pool.end();
  }
});
