import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { ReportRepository } from './report.repository';
import { ReportService } from './report.service';

test('provider report review is claimed by one administrator and rejects stale competing decisions', { timeout: 60_000 }, async () => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const repository = new ReportRepository(db);
  const owner = 'report_multi_admin_owner';
  const reviewerA = 'report_multi_admin_reviewer_a';
  const reviewerB = 'report_multi_admin_reviewer_b';
  const profile = 'profile_report_multi_admin_1234';
  const professional = 'professional_profile_report_multi_admin_1234';
  const report = 'report_multi_admin_current';

  try {
    await resetCanonicalTestSchema(pool);
    await db.query(
      `INSERT INTO core_user_accounts
         (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
       VALUES ($1,'identity_report_multi_admin_owner','individual_user','active','active','private'),
              ($2,'identity_report_multi_admin_reviewer_a','individual_user','active','active','private'),
              ($3,'identity_report_multi_admin_reviewer_b','individual_user','active','active','private')`,
      [owner, reviewerA, reviewerB]
    );
    await db.query(
      `INSERT INTO profiles
         (profile_identifier,user_identifier,profile_type,display_name,lifecycle_status,visibility)
       VALUES ($1,$2,'professional_profile','مهني بلاغ متعدد الإدارة','active','private')`,
      [profile, owner]
    );
    await db.query(
      `INSERT INTO professional_profiles
         (professional_profile_identifier,profile_identifier,user_identifier,profession_type,lifecycle_status,visibility,
          moderation_status,headline_ar,city_code,country_code)
       VALUES ($1,$2,$3,'consultant','active','public','approved','مهني بلاغ متعدد الإدارة','damascus','SY')`,
      [professional, profile, owner]
    );
    await db.query(
      `INSERT INTO provider_reports
         (report_identifier,reporter_user_identifier,target_type,professional_profile_identifier,reason_code,details,status,created_at,updated_at)
       VALUES ($1,$2,'professional',$3,'other','تفاصيل بلاغ اختبار متعدد الإدارة','submitted',clock_timestamp(),clock_timestamp())`,
      [report, owner, professional]
    );

    assert.equal(await repository.review(report, reviewerA, 'in_review', 'Administrator A started review.'), true);
    assert.equal(await repository.review(report, reviewerB, 'resolved', 'Administrator B used a stale queue.'), false);
    assert.equal(await repository.review(report, reviewerA, 'resolved', 'Administrator A completed review.'), true);

    let [state] = await db.query<{ status: string; reviewed_by_user_identifier: string; resolution_note: string }>(
      `SELECT status,reviewed_by_user_identifier,resolution_note FROM provider_reports WHERE report_identifier=$1`,
      [report]
    );
    assert.deepEqual(state, {
      status: 'resolved',
      reviewed_by_user_identifier: reviewerA,
      resolution_note: 'Administrator A completed review.'
    });

    await db.query(
      `UPDATE provider_reports
       SET status='submitted',reviewed_by_user_identifier=NULL,resolution_note=NULL,updated_at=clock_timestamp()
       WHERE report_identifier=$1`,
      [report]
    );

    const competing = await Promise.all([
      repository.review(report, reviewerA, 'in_review', 'Administrator A claims the report.'),
      repository.review(report, reviewerB, 'dismissed', 'Administrator B makes a competing decision.')
    ]);
    assert.equal(competing.filter(Boolean).length, 1);

    [state] = await db.query<{ status: string; reviewed_by_user_identifier: string; resolution_note: string }>(
      `SELECT status,reviewed_by_user_identifier,resolution_note FROM provider_reports WHERE report_identifier=$1`,
      [report]
    );
    assert.ok([reviewerA, reviewerB].includes(state.reviewed_by_user_identifier));
    assert.ok(['in_review', 'dismissed'].includes(state.status));
  } finally {
    await pool.end();
  }
});

test('stale report review is surfaced as a conflict and creates no audit record', async () => {
  let auditCalls = 0;
  const service = new ReportService(
    {
      review: async () => false,
      exists: async () => true
    } as any,
    { getCurrentUser: async () => ({ id: 'report_reviewer_b', email: 'report-reviewer-b@example.test' }) } as any,
    { appendAuditLog: async () => { auditCalls += 1; } } as any,
    { assert: () => undefined } as any
  );

  await assert.rejects(
    service.review(undefined, 'report_stale_review', { status: 'resolved', note: 'Stale administrative decision.' }),
    ConflictException
  );
  assert.equal(auditCalls, 0);
});
