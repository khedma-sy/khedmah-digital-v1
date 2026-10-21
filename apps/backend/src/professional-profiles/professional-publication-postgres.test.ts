import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import type { IdentityService } from '../identity/identity.service';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { KoraAdminRepository } from '../kora-admin/kora-admin.repository';
import { ProfessionalProfileRepository } from './professional-profile.repository';
import { ProfessionalProfileService } from './professional-profile.service';

test('professional publication requires owner intent, submitted content and a current independent review on PostgreSQL', async (t) => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const priorBindings = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  let createdTaxiSchema = false;
  try {
    await resetCanonicalTestSchema(pool);
    const accounts = new IdentityRepository(db);
    const repository = new ProfessionalProfileRepository(db);
    const rbac = new OperationsRbacService();
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({
      'publication_reviewer@example.test': ['security_operations_engineer'],
      'publication_self_reviewer@example.test': ['security_operations_engineer']
    });

    async function serviceFor(actorId: string) {
      const now = new Date().toISOString();
      await accounts.saveAccount({
        id: actorId, email: `${actorId}@example.test`, passwordHash: 'fixture-not-a-login',
        status: 'active', createdAt: now, updatedAt: now
      });
      await accounts.saveProfile({ userId: actorId, displayName: actorId, locale: 'ar', createdAt: now, updatedAt: now });
      const identity = { getCurrentUser: async () => ({ id: actorId, email: `${actorId}@example.test` }) } as unknown as IdentityService;
      return new ProfessionalProfileService(repository, identity, rbac);
    }

    const reviewer = await serviceFor('publication_reviewer');
    const nonowner = await serviceFor('publication_nonowner');
    const input = { headlineAr: 'اختبار النشر المهني', cityCode: 'damascus', countryCode: 'SY', skills: ['خبرة'] };
    async function draft(actorId: string, visibility?: 'public' | 'private') {
      const owner = await serviceFor(actorId);
      const profile = await owner.createOrUpdate(undefined, { ...input, ...(visibility ? { visibility } : {}) });
      return { owner, profile };
    }
    async function approve(id: string) {
      const profile = (await repository.findById(id))!;
      return reviewer.approveModeration(undefined, id, profile.revision);
    }
    async function update(owner: ProfessionalProfileService, visibility?: 'public' | 'private', headlineAr = input.headlineAr) {
      const current = await owner.getMine(undefined);
      return owner.createOrUpdate(undefined, {
        ...input, headlineAr, expectedContentRevision: current.contentRevision,
        ...(visibility === undefined ? {} : { visibility })
      });
    }
    async function assertHidden(id: string) {
      await assert.rejects(() => reviewer.getProfile(id), NotFoundException);
      assert.equal((await reviewer.search({})).professionals.some((profile) => profile.id === id), false);
    }

    await t.test('explicit public intent starts as an unsubmitted draft; only independent review after owner submission makes it public', async () => {
      const { owner, profile } = await draft('publication_happy_owner', 'public');
      assert.deepEqual((await owner.getMine(undefined)).contactEligibility, {
        visibility: 'public', moderationStatus: 'pending', lifecycleStatus: 'created', eligible: false
      });
      assert.equal((await reviewer.listPendingModeration(undefined)).some((item) => item.id === profile.id), false);
      await assertHidden(profile.id);
      await assert.rejects(() => reviewer.approveModeration(undefined, profile.id, profile.revision), ConflictException);
      await assert.rejects(() => reviewer.rejectModeration(undefined, profile.id, 'لم يرسل المالك المسودة', profile.revision), ConflictException);
      await assert.rejects(() => nonowner.submitForReview(undefined, profile.id), ForbiddenException);
      assert.equal((await repository.listTrustHistory(profile.id)).length, 0);

      await owner.submitForReview(undefined, profile.id);
      const queued = (await reviewer.listPendingModeration(undefined)).find((item) => item.id === profile.id);
      assert.ok(queued);
      assert.equal((await owner.getMine(undefined)).contactEligibility?.lifecycleStatus, 'pending');
      await assertHidden(profile.id);
      await reviewer.approveModeration(undefined, profile.id, queued.reviewSnapshot.exactRevision);

      const published = await reviewer.getProfile(profile.id);
      assert.equal(published.id, profile.id);
      assert.deepEqual(published.contactEligibility, {
        visibility: 'public', moderationStatus: 'approved', lifecycleStatus: 'active', eligible: true
      });
      assert.equal((await reviewer.search({})).professionals.some((item) => item.id === profile.id), true);
      assert.equal((await owner.getMine(undefined)).contactEligibility?.eligible, true);
      assert.equal(await repository.findVerificationRequest(profile.id), undefined, 'publication must not fabricate a trust-verification decision');
      assert.deepEqual((await repository.listTrustHistory(profile.id)).map((entry) => entry.newStatus).reverse(), ['pending', 'approved']);
      assert.equal('userId' in published, false);
    });

    await t.test('omitted or explicit private intent remains hidden after review; approval never chooses publication for the owner', async () => {
      for (const visibility of [undefined, 'private'] as const) {
        const { owner, profile } = await draft(`publication_private_${visibility ?? 'omitted'}`, visibility);
        await owner.submitForReview(undefined, profile.id);
        await approve(profile.id);
        assert.deepEqual((await owner.getMine(undefined)).contactEligibility, {
          visibility: 'private', moderationStatus: 'approved', lifecycleStatus: 'active', eligible: false
        });
        await assertHidden(profile.id);
      }
    });

    await t.test('changing a previously approved private profile to public requires a new review of that exact revision', async () => {
      const { owner, profile } = await draft('publication_private_to_public');
      await owner.submitForReview(undefined, profile.id);
      const approved = await approve(profile.id);
      const requested = await update(owner, 'public');
      assert.notEqual(requested.contentRevision, approved.contentRevision);
      assert.equal((await owner.getMine(undefined)).contactEligibility?.moderationStatus, 'pending');
      await assertHidden(profile.id);
      await assert.rejects(() => reviewer.approveModeration(undefined, profile.id, approved.revision), ConflictException);
      await approve(profile.id);
      assert.equal((await reviewer.getProfile(profile.id)).contactEligibility?.eligible, true);
    });

    await t.test('omitted visibility edits preserve owner choice and unchanged saves preserve approval', async () => {
      for (const visibility of ['private', 'public'] as const) {
        const { owner, profile } = await draft(`publication_preserve_${visibility}`, visibility);
        await owner.submitForReview(undefined, profile.id);
        await approve(profile.id);
        const before = await owner.getMine(undefined);
        const saved = await update(owner);
        const after = await owner.getMine(undefined);
        assert.equal(saved.contentRevision, before.contentRevision);
        assert.equal(after.contactEligibility?.visibility, visibility);
        assert.equal(after.contactEligibility?.moderationStatus, 'approved');
      }
    });

    await t.test('privacy withdrawal hides immediately and invalidates stale owner tabs and reviewer snapshots', async () => {
      const { owner, profile } = await draft('publication_withdraw_owner', 'public');
      await owner.submitForReview(undefined, profile.id);
      await approve(profile.id);
      const before = (await repository.findById(profile.id))!;
      await update(owner, 'private');
      await assertHidden(profile.id);
      const current = (await repository.findById(profile.id))!;
      assert.notEqual(current.contentRevision, before.contentRevision);
      await assert.rejects(() => repository.updateOwner(before, before.contentRevision!, 'publication_withdraw_owner', 'public'), ConflictException);
      await assert.rejects(() => reviewer.approveModeration(undefined, profile.id, before.revision), ConflictException);
      assert.equal((await owner.getMine(undefined)).contactEligibility?.visibility, 'private');
    });

    await t.test('an independent approval racing a privacy withdrawal cannot restore public visibility', async () => {
      const { owner, profile } = await draft('publication_race_owner', 'public');
      await owner.submitForReview(undefined, profile.id);
      const before = (await repository.findById(profile.id))!;
      const [withdrawal, decision] = await Promise.allSettled([
        repository.updateOwner(before, before.contentRevision!, 'publication_race_owner', 'private'),
        reviewer.approveModeration(undefined, profile.id, before.revision)
      ]);
      assert.equal(withdrawal.status, 'fulfilled');
      if (decision.status === 'rejected') assert.ok(decision.reason instanceof ConflictException);
      assert.deepEqual((await owner.getMine(undefined)).contactEligibility, {
        visibility: 'private', moderationStatus: 'pending', lifecycleStatus: decision.status === 'fulfilled' ? 'active' : 'pending', eligible: false
      });
      await assertHidden(profile.id);
    });

    await t.test('rejection, self-approval and another owner cannot publish or overwrite the profile', async () => {
      const { owner, profile } = await draft('publication_self_reviewer', 'public');
      await owner.submitForReview(undefined, profile.id);
      const before = (await repository.findById(profile.id))!;
      await assert.rejects(() => owner.approveModeration(undefined, profile.id, before.revision), ForbiddenException);
      await assert.rejects(() => nonowner.approveModeration(undefined, profile.id, before.revision), ForbiddenException);
      await assert.rejects(() => repository.updateOwner(before, before.contentRevision!, 'publication_nonowner', 'public'), ConflictException);
      await reviewer.rejectModeration(undefined, profile.id, 'المحتوى يحتاج تصحيحًا قبل النشر', before.revision);
      await assertHidden(profile.id);
      assert.equal((await owner.getMine(undefined)).contactEligibility?.moderationStatus, 'rejected');
      await assert.rejects(() => approve(profile.id), ConflictException);
    });

    await t.test('internal classification cannot be overridden by owner publication intent', async () => {
      const { owner, profile } = await draft('publication_internal_owner');
      // Internal is an administrative fixture, never an owner-writable request value.
      await db.query(`UPDATE professional_profiles SET visibility='internal' WHERE professional_profile_identifier=$1`, [profile.id]);
      await assert.rejects(() => update(owner, 'public'), ConflictException);
      await assert.rejects(() => update(owner, 'private'), ConflictException);
      await update(owner, undefined, 'تعديل محتوى ملف داخلي');
      assert.equal((await owner.getMine(undefined)).contactEligibility?.visibility, 'internal');
      await assertHidden(profile.id);
    });

    await t.test('owner publication intent cannot lift suspension or an archived lifecycle', async () => {
      for (const state of ['suspended', 'archived'] as const) {
        const { owner, profile } = await draft(`publication_${state}_owner`, 'private');
        await owner.submitForReview(undefined, profile.id);
        await approve(profile.id);
        if (state === 'suspended') await reviewer.suspendProfessional(undefined, profile.id, 'إيقاف إداري للاختبار');
        else await db.query(`UPDATE professional_profiles SET lifecycle_status='archived',archived_at=clock_timestamp() WHERE professional_profile_identifier=$1`, [profile.id]);
        await update(owner, 'public');
        const current = await owner.getMine(undefined);
        assert.equal(current.contactEligibility?.lifecycleStatus, state);
        if (state === 'suspended') assert.equal(current.contactEligibility?.moderationStatus, 'suspended');
        await assert.rejects(() => owner.submitForReview(undefined, profile.id), ConflictException);
        await assert.rejects(() => approve(profile.id), ConflictException);
        await assertHidden(profile.id);
      }
    });

    await t.test('KORA review counters match the submitted queue and do not report old owner drafts as overdue reviews', async () => {
      // The metrics reader covers several existing domains. Replay their actual migrations in this disposable database.
      await db.query('DROP SCHEMA IF EXISTS khedmah_taxi CASCADE');
      for (const migration of [
        '024_product_store', '025_classifieds', '026_cash_fulfillment_orders', '027_mobility_document_reviews',
        '028_platform_notifications', '029_taxi_pricing_revisions', '030_billing_credits_subscriptions', '031_taxi_operational_approvals'
      ]) {
        await pool.query(await readFile(resolve(__dirname, '../../../../backend/migrations/versions', `${migration}.sql`), 'utf8'));
        if (migration === '031_taxi_operational_approvals') createdTaxiSchema = true;
      }
      const metrics = new KoraAdminRepository(db);
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const before = await metrics.serviceMetrics(since);
      const { owner, profile } = await draft('publication_queue_metrics_owner', 'public');
      await db.query(`UPDATE professional_profiles SET created_at=clock_timestamp()-INTERVAL '3 days',updated_at=clock_timestamp()-INTERVAL '2 days' WHERE professional_profile_identifier=$1`, [profile.id]);
      const draftMetrics = await metrics.serviceMetrics(since);
      assert.equal(draftMetrics.professional_profiles_pending_review, before.professional_profiles_pending_review);
      assert.equal(draftMetrics.professional_profiles_review_overdue_24h, before.professional_profiles_review_overdue_24h);

      await owner.submitForReview(undefined, profile.id);
      const submitted = await metrics.serviceMetrics(since);
      assert.equal(submitted.professional_profiles_pending_review, before.professional_profiles_pending_review + 1);
      assert.equal(submitted.professional_profiles_pending_review, (await reviewer.listPendingModeration(undefined)).length);
      await db.query(`UPDATE professional_profiles SET updated_at=clock_timestamp()-INTERVAL '2 days' WHERE professional_profile_identifier=$1`, [profile.id]);
      assert.equal((await metrics.serviceMetrics(since)).professional_profiles_review_overdue_24h, before.professional_profiles_review_overdue_24h + 1);
      await approve(profile.id);
      assert.equal((await metrics.serviceMetrics(since)).professional_profiles_pending_review, before.professional_profiles_pending_review);
    });
  } finally {
    if (priorBindings === undefined) delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
    else process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = priorBindings;
    try {
      if (createdTaxiSchema) await pool.query('DROP SCHEMA khedmah_taxi CASCADE');
    } finally {
      await pool.end();
    }
  }
});
