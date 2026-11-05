import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planProfessionalAutoReview, type ProfessionalAutoReviewCandidate } from './smart-admin-professional-execution';

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
