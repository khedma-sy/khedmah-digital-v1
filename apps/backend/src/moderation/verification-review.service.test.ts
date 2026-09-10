import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { VerificationReviewService } from './verification-review.service';

test('verification review is request-bound, revision-bound, audited, and never auto-publishes professionals', { timeout: 60_000 }, async (t) => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const owner = 'verification_review_owner';
  const reviewer = 'verification_review_operator';
  const business = 'verification_review_business';
  const professional = 'professional_profile_verification_review_1234';
  const profile = 'profile_verification_review_1234';
  const identity = { getCurrentUser: async () => ({ id: reviewer, email: 'verification-reviewer@example.test' }) } as any;
  const rbac = { assert: () => undefined } as any;
  const service = new VerificationReviewService(db, identity, rbac);

  try {
    await resetCanonicalTestSchema(pool);
    await db.query(
      `INSERT INTO core_user_accounts
         (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
       VALUES ($1,'identity_verification_review_owner','individual_user','active','active','private'),
              ($2,'identity_verification_review_operator','individual_user','active','active','private')`,
      [owner, reviewer]
    );
    await db.query(
      `INSERT INTO profiles
         (profile_identifier,user_identifier,profile_type,display_name,lifecycle_status,visibility)
       VALUES ($1,$2,'professional_profile','مهني التحقق','active','private')`,
      [profile, owner]
    );
    await db.query(
      `INSERT INTO professional_profiles
         (professional_profile_identifier,profile_identifier,user_identifier,profession_type,lifecycle_status,visibility,
          moderation_status,headline_ar,city_code,country_code)
       VALUES ($1,$2,$3,'consultant','pending','public','pending','مهني للمراجعة','damascus','SY')`,
      [professional, profile, owner]
    );
    const [category] = await db.query<{ code: string }>(
      `SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`
    );
    assert.ok(category);
    await db.query(
      `INSERT INTO business_profiles
         (id,name,owner_user_id,visibility,moderation_status,trust_status,status,category_code,city_code,country_code)
       VALUES ($1,'نشاط للتحقق',$2,'public','pending','pending','active',$3,'damascus','SY')`,
      [business, owner, category.code]
    );

    await db.query(
      `INSERT INTO verification_requests (id,entity_type,entity_id,requester_id,status,created_at,updated_at)
       VALUES
         ('verification-business-old','business',$1,$3,'pending',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '2 minutes'),
         ('verification-business-current','business',$1,$3,'pending',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '1 minute'),
         ('verification-professional-current','professional',$2,$3,'pending',clock_timestamp(),clock_timestamp())`,
      [business, professional, owner]
    );

    await t.test('queue exposes only the latest pending request with the exact review revision', async () => {
      const pending = await service.listPending(undefined);
      assert.equal(pending.length, 2);
      assert.equal(pending.some((item) => item.requestId === 'verification-business-old'), false);
      for (const item of pending) assert.match(item.profileRevision, /\.\d{6}Z$/);
    });

    await t.test('an older request cannot be approved after a newer request exists', async () => {
      const current = (await service.listPending(undefined)).find((item) => item.entityType === 'business')!;
      await assert.rejects(
        service.approve(undefined, 'verification-business-old', current.profileRevision, 'Reviewed evidence for the exact request.'),
        ConflictException
      );
      const [row] = await db.query<{ status: string }>(`SELECT status FROM verification_requests WHERE id='verification-business-old'`);
      assert.equal(row.status, 'pending');
    });

    await t.test('business approval commits exact request, reviewer, audit, and trust without changing moderation', async () => {
      const current = (await service.listPending(undefined)).find((item) => item.entityType === 'business')!;
      const result = await service.approve(undefined, current.requestId, current.profileRevision, 'Business verification evidence reviewed by operator.');
      assert.equal(result.status, 'approved');
      const [request] = await db.query<{ status: string; reviewed_by: string; reviewed_at: Date | null }>(
        `SELECT status,reviewed_by,reviewed_at FROM verification_requests WHERE id=$1`, [current.requestId]
      );
      assert.equal(request.status, 'approved');
      assert.equal(request.reviewed_by, reviewer);
      assert.ok(request.reviewed_at);
      const [parent] = await db.query<{ trust_status: string; moderation_status: string; status: string }>(
        `SELECT trust_status,moderation_status,status FROM business_profiles WHERE id=$1`, [business]
      );
      assert.deepEqual(parent, { trust_status: 'approved', moderation_status: 'pending', status: 'active' });
      const [history] = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM trust_history WHERE entity_type='business' AND entity_id=$1`, [business]
      );
      assert.equal(history.count, 1);
    });

    await t.test('professional approval records the request decision but does not approve moderation or lifecycle', async () => {
      const current = (await service.listPending(undefined)).find((item) => item.entityType === 'professional')!;
      const before = await db.query<{ moderation_status: string; lifecycle_status: string; visibility: string }>(
        `SELECT moderation_status,lifecycle_status,visibility FROM professional_profiles WHERE professional_profile_identifier=$1`,
        [professional]
      );
      const result = await service.approve(undefined, current.requestId, current.profileRevision, 'Professional evidence reviewed; publication remains separately moderated.');
      assert.equal(result.status, 'approved');
      const after = await db.query<{ moderation_status: string; lifecycle_status: string; visibility: string }>(
        `SELECT moderation_status,lifecycle_status,visibility FROM professional_profiles WHERE professional_profile_identifier=$1`,
        [professional]
      );
      assert.deepEqual(after, before);
      const [request] = await db.query<{ status: string; reviewed_by: string }>(
        `SELECT status,reviewed_by FROM verification_requests WHERE id=$1`, [current.requestId]
      );
      assert.deepEqual(request, { status: 'approved', reviewed_by: reviewer });
    });

    await t.test('profile changes after queue load reject the stale verification decision atomically', async () => {
      await db.query(
        `UPDATE verification_requests SET created_at=clock_timestamp()-interval '1 minute' WHERE id='verification-professional-current'`
      );
      await db.query(
        `INSERT INTO verification_requests (id,entity_type,entity_id,requester_id,status,created_at,updated_at)
         VALUES ('verification-professional-next','professional',$1,$2,'pending',clock_timestamp(),clock_timestamp())`,
        [professional, owner]
      );
      const displayed = (await service.listPending(undefined)).find((item) => item.requestId === 'verification-professional-next')!;
      await db.query(
        `UPDATE professional_profiles SET headline_ar='تعديل بعد فتح قائمة التحقق',
         updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond')
         WHERE professional_profile_identifier=$1`,
        [professional]
      );
      await assert.rejects(
        service.approve(undefined, displayed.requestId, displayed.profileRevision, 'This decision uses the stale displayed revision.'),
        ConflictException
      );
      const [request] = await db.query<{ status: string; reviewed_by: string | null }>(
        `SELECT status,reviewed_by FROM verification_requests WHERE id=$1`, [displayed.requestId]
      );
      assert.deepEqual(request, { status: 'pending', reviewed_by: null });
    });

    await t.test('missing revision or meaningful reviewer notes fail before database mutation', async () => {
      await assert.rejects(
        service.reject(undefined, 'verification-professional-next', undefined, 'Reviewer note is long enough.'),
        BadRequestException
      );
      const current = (await service.listPending(undefined)).find((item) => item.requestId === 'verification-professional-next')!;
      await assert.rejects(
        service.reject(undefined, current.requestId, current.profileRevision, 'short'),
        BadRequestException
      );
    });

    await t.test('RBAC remains mandatory before queue disclosure or decisions', async () => {
      const denied = new VerificationReviewService(
        db,
        identity,
        { assert: () => { throw new ForbiddenException('denied'); } } as any
      );
      await assert.rejects(denied.listPending(undefined), ForbiddenException);
    });
  } finally {
    await pool.end();
  }
});
