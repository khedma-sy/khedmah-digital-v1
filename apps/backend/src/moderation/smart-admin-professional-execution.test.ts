import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planProfessionalAutoReview, authorizeProfessionalAutoReviewPlan, type ProfessionalAutoReviewCandidate } from './smart-admin-professional-execution';

const revision = '2026-11-05T14:55:20.000001Z';
const candidate: ProfessionalAutoReviewCandidate = {
  profileId: 'professional_1', expectedRevision: revision, snapshotRevision: revision,
  ownerUserId: 'owner_1', serviceActorUserId: 'service_1', submitted: true,
  snapshotComplete: true, flagged: false, categoryAllowed: true,
  checksPassed: true, policyVersion: 'reviewed-v1'
};

test('plans only eligible routine professional content without writing approval', () => {
  assert.deepEqual(planProfessionalAutoReview(candidate), {
    ready: true, profileId: 'professional_1', expectedRevision: revision, policyVersion: 'reviewed-v1'
  });
});
test('stale revision fails closed', () => {
  assert.deepEqual(planProfessionalAutoReview({ ...candidate, snapshotRevision: 'old' }),
    { ready: false, reason: 'stale_revision' });
});
test('self approval fails closed', () => {
  assert.deepEqual(planProfessionalAutoReview({ ...candidate, serviceActorUserId: 'owner_1' }),
    { ready: false, reason: 'self_approval' });
});
test('missing service actor, malformed revision, and risk flags fail closed', () => {
  for (const changed of [
    { serviceActorUserId: '' }, { expectedRevision: 'invalid' }, { flagged: true },
    { checksPassed: false }, { categoryAllowed: false }, { submitted: false }
  ]) assert.equal(planProfessionalAutoReview({ ...candidate, ...changed }).ready, false);
});

test('rejects padded actor identifiers and impossible revision dates', () => {
  for (const changed of [
    { profileId: ' professional_1' },
    { ownerUserId: 'owner_1 ' },
    { serviceActorUserId: ' service_1' },
    { expectedRevision: '2026-02-30T14:55:20.000001Z' },
    { expectedRevision: '2026-11-05T25:55:20.000001Z' },
    { expectedRevision: '2026-11-05T14:99:20.000001Z' }
  ]) {
    assert.deepEqual(planProfessionalAutoReview({ ...candidate, ...changed }),
      { ready: false, reason: 'invalid_review_identity_or_revision' });
  }
});

test('rejects invalid snapshot and unreviewed policy metadata', () => {
  for (const changed of [
    { snapshotRevision: 'not-a-revision' },
    { policyVersion: '' },
    { policyVersion: ' reviewed-v1' },
    { policyVersion: 'reviewed-v1 ' },
    { policyVersion: 'v'.repeat(129) }
  ]) {
    assert.equal(planProfessionalAutoReview({ ...candidate, ...changed }).ready, false);
  }
});

test('rejects impossible snapshot dates and unsafe policy identifiers', () => {
  for (const changed of [
    { snapshotRevision: '2026-02-30T14:55:20.000001Z' },
    { snapshotRevision: '2026-11-05T25:55:20.000001Z' },
    { policyVersion: 'reviewed v1' },
    { policyVersion: 'reviewed/v1' },
    { policyVersion: 'reviewed\\nv1' }
  ]) {
    assert.deepEqual(planProfessionalAutoReview({ ...candidate, ...changed }),
      { ready: false, reason: 'invalid_review_identity_or_revision' });
  }
});

test('only authenticated, permissioned service principal can receive ready plan', () => {
  const plan = planProfessionalAutoReview(candidate);
  assert.equal(plan.ready, true);
  const principal = { userId: 'service_1', isServiceIdentity: true, canApproveProfessionalContent: true };
  assert.deepEqual(authorizeProfessionalAutoReviewPlan(plan, candidate, principal), plan);
  for (const rejected of [
    null,
    { ...principal, isServiceIdentity: false },
    { ...principal, canApproveProfessionalContent: false },
    { ...principal, userId: 'owner_1' },
    { ...principal, userId: 'other_service' },
    { ...principal, userId: ' service_1' }
  ]) {
    assert.deepEqual(authorizeProfessionalAutoReviewPlan(plan, candidate, rejected),
      { ready: false, reason: 'untrusted_or_unauthorized_service_principal' });
  }
  assert.equal(authorizeProfessionalAutoReviewPlan({ ready: false, reason: 'risk_flag' }, candidate, principal).ready, false);
  assert.equal(authorizeProfessionalAutoReviewPlan(plan, { ...candidate, profileId: 'other_profile' }, principal).ready, false);
});

test('forged ready plan cannot bypass live eligibility checks', () => {
  const forged = { ready: true as const, profileId: candidate.profileId,
    expectedRevision: candidate.expectedRevision, policyVersion: candidate.policyVersion };
  const principal = { userId: candidate.serviceActorUserId, isServiceIdentity: true,
    canApproveProfessionalContent: true };
  for (const changed of [
    { flagged: true },
    { submitted: false },
    { snapshotComplete: false },
    { checksPassed: false },
    { categoryAllowed: false },
    { snapshotRevision: '2026-11-05T14:55:21.000001Z' },
    { ownerUserId: candidate.serviceActorUserId }
  ]) {
    assert.equal(authorizeProfessionalAutoReviewPlan(forged, { ...candidate, ...changed }, principal).ready, false);
  }
});

test('malformed runtime payloads fail closed without throwing', () => {
  for (const input of [null, undefined, {}, { ...candidate, profileId: null },
    { ...candidate, expectedRevision: 123 }, { ...candidate, flagged: 'false' },
    { ...candidate, checksPassed: 1 }]) {
    assert.deepEqual(planProfessionalAutoReview(input as ProfessionalAutoReviewCandidate),
      { ready: false, reason: 'invalid_review_candidate' });
  }
  const ready = planProfessionalAutoReview(candidate);
  for (const principal of [null, { userId: null, isServiceIdentity: true, canApproveProfessionalContent: true },
    { userId: 'service_1', isServiceIdentity: 'true', canApproveProfessionalContent: true }]) {
    assert.equal(authorizeProfessionalAutoReviewPlan(ready, candidate,
      principal as Parameters<typeof authorizeProfessionalAutoReviewPlan>[2]).ready, false);
  }
  assert.deepEqual(authorizeProfessionalAutoReviewPlan(null as unknown as typeof ready, candidate,
    { userId: 'service_1', isServiceIdentity: true, canApproveProfessionalContent: true }),
    { ready: false, reason: 'invalid_review_plan' });
});
