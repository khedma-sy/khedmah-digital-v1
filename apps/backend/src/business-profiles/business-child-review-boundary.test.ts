import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { BusinessProfileRepository } from './business-profile.repository';
import type { OpeningHours } from './business-profile.types';

// Real PostgreSQL coverage: child writes and reviewer decisions contend on the same parent revision.
test('business child content invalidates review and rejects a stale reviewer revision', { timeout: 60_000 }, async () => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const repository = new BusinessProfileRepository(db);
  const owner = 'review_boundary_owner';
  const reviewer = 'review_boundary_reviewer';
  const business = 'review_boundary_business';
  try {
    await resetCanonicalTestSchema(pool);
    await db.query(
      `INSERT INTO core_user_accounts
         (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
       VALUES ($1,'identity_review_boundary_owner','individual_user','active','active','private'),
              ($2,'identity_review_boundary_reviewer','individual_user','active','active','private')`,
      [owner, reviewer]
    );
    const [category] = await db.query<{ code: string }>(
      `SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`
    );
    assert.ok(category);
    await db.query(
      `INSERT INTO business_profiles
         (id,name,owner_user_id,visibility,moderation_status,trust_status,status,category_code,city_code,country_code)
       VALUES ($1,'Review boundary business',$2,'public','approved','approved','active',$3,'damascus','SY')`,
      [business, owner, category.code]
    );

    const before = await repository.findById(business);
    assert.ok(before?.revision);
    assert.equal(before.moderationStatus, 'approved');

    const hours: OpeningHours[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      id: `review_boundary_hour_${dayOfWeek}`,
      businessProfileId: business,
      dayOfWeek,
      openTime: '09:00',
      closeTime: '17:00',
      isClosed: false
    }));
    await repository.replaceOpeningHours(business, hours, owner);

    const after = await repository.findById(business);
    assert.ok(after?.revision);
    assert.equal(after.moderationStatus, 'pending');
    assert.equal(after.trustStatus, 'approved');
    assert.equal(after.status, 'active');
    assert.notEqual(after.revision, before.revision, 'child mutation must advance the parent review revision');

    await assert.rejects(
      repository.review(business, reviewer, 'approved', before.revision),
      ConflictException
    );
    assert.equal((await repository.findById(business))?.moderationStatus, 'pending');
  } finally {
    await pool.end();
  }
});
