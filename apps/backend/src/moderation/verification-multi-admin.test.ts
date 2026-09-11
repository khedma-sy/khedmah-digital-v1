import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { VerificationReviewService } from './verification-review.service';

test('two authorized administrators cannot overwrite the same verification decision', { timeout: 60_000 }, async () => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const previousBindings = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;

  const owner = 'verification_multi_admin_owner';
  const reviewerA = 'verification_multi_admin_reviewer_a';
  const reviewerB = 'verification_multi_admin_reviewer_b';
  const reviewerAEmail = 'verification-admin-a@example.test';
  const reviewerBEmail = 'verification-admin-b@example.test';
  const profile = 'profile_verification_multi_admin_1234';
  const professional = 'professional_profile_verification_multi_admin_1234';
  const requestId = 'verification-multi-admin-current';

  try {
    await resetCanonicalTestSchema(pool);

    await db.query(
      `INSERT INTO core_user_accounts
         (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
       VALUES ($1,'identity_verification_multi_admin_owner','individual_user','active','active','private'),
              ($2,'identity_verification_multi_admin_reviewer_a','individual_user','active','active','private'),
              ($3,'identity_verification_multi_admin_reviewer_b','individual_user','active','active','private')`,
      [owner, reviewerA, reviewerB]
    );

    await db.query(
      `INSERT INTO profiles
         (profile_identifier,user_identifier,profile_type,display_name,lifecycle_status,visibility)
       VALUES ($1,$2,'professional_profile','مهني اختبار تعدد الإدارة','active','private')`,
      [profile, owner]
    );

    await db.query(
      `INSERT INTO professional_profiles
         (professional_profile_identifier,profile_identifier,user_identifier,profession_type,lifecycle_status,visibility,
          moderation_status,headline_ar,city_code,country_code)
       VALUES ($1,$2,$3,'consultant','pending','public','pending','مهني متعدد الإدارة','damascus','SY')`,
      [professional, profile, owner]
    );

    await db.query(
      `INSERT INTO verification_requests
         (id,entity_type,entity_id,requester_id,status,created_at,updated_at)
       VALUES ($1,'professional',$2,$3,'pending',clock_timestamp(),clock_timestamp())`,
      [requestId, professional, owner]
    );

    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({
      [reviewerAEmail]: ['security_operations_engineer'],
      [reviewerBEmail]: ['security_operations_engineer']
    });

    const rbac = new OperationsRbacService();
    const serviceA = new VerificationReviewService(
      db,
      { getCurrentUser: async () => ({ id: reviewerA, email: reviewerAEmail }) } as any,
      rbac
    );
    const serviceB = new VerificationReviewService(
      db,
      { getCurrentUser: async () => ({ id: reviewerB, email: reviewerBEmail }) } as any,
      rbac
    );

    const [queueA, queueB] = await Promise.all([
      serviceA.listPending(undefined),
      serviceB.listPending(undefined)
    ]);
    const displayedA = queueA.find((item) => item.requestId === requestId);
    const displayedB = queueB.find((item) => item.requestId === requestId);

    assert.ok(displayedA);
    assert.ok(displayedB);
    assert.equal(displayedA.profileRevision, displayedB.profileRevision);

    const outcomes = await Promise.allSettled([
      serviceA.approve(
        undefined,
        requestId,
        displayedA.profileRevision,
        'Administrator A approved the exact verification snapshot.'
      ),
      serviceB.reject(
        undefined,
        requestId,
        displayedB.profileRevision,
        'Administrator B rejected the exact verification snapshot.'
      )
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const conflicts = outcomes.filter(
      (outcome) => outcome.status === 'rejected' && outcome.reason instanceof ConflictException
    );
    assert.equal(fulfilled.length, 1);
    assert.equal(conflicts.length, 1);

    const [request] = await db.query<{
      status: string;
      reviewed_by: string | null;
      reviewed_at: Date | null;
    }>(
      `SELECT status,reviewed_by,reviewed_at FROM verification_requests WHERE id=$1`,
      [requestId]
    );
    assert.ok(['approved', 'rejected'].includes(request.status));
    assert.ok([reviewerA, reviewerB].includes(request.reviewed_by ?? ''));
    assert.ok(request.reviewed_at);

    const history = await db.query<{
      changed_by: string;
      old_status: string;
      new_status: string;
    }>(
      `SELECT changed_by,old_status,new_status
       FROM trust_history
       WHERE entity_type='professional' AND entity_id=$1`,
      [professional]
    );
    assert.equal(history.length, 1);
    assert.equal(history[0].changed_by, request.reviewed_by);
    assert.equal(history[0].old_status, 'verification:pending');
    assert.equal(history[0].new_status, `verification:${request.status}`);

    const [professionalState] = await db.query<{
      moderation_status: string;
      lifecycle_status: string;
      visibility: string;
    }>(
      `SELECT moderation_status,lifecycle_status,visibility
       FROM professional_profiles
       WHERE professional_profile_identifier=$1`,
      [professional]
    );
    assert.deepEqual(professionalState, {
      moderation_status: 'pending',
      lifecycle_status: 'pending',
      visibility: 'public'
    });
  } finally {
    if (previousBindings === undefined) delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
    else process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = previousBindings;
    await pool.end();
  }
});
