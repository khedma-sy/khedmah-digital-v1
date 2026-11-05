import { assessSmartAdminEligibility } from './smart-admin-eligibility';

/**
 * A preparation contract, not a runnable approval worker. The actual writer must
 * independently authenticate a least-privilege service identity and recheck the
 * exact revision atomically in writeProfileReview before any approval.
 */
export type ProfessionalAutoReviewCandidate = {
  profileId: string;
  expectedRevision: string;
  ownerUserId: string;
  serviceActorUserId: string;
  submitted: boolean;
  snapshotComplete: boolean;
  flagged: boolean;
  categoryAllowed: boolean;
  checksPassed: boolean;
  policyVersion: string;
  snapshotRevision: string;
};

export type ProfessionalAutoReviewPlan =
  | { ready: true; profileId: string; expectedRevision: string; policyVersion: string }
  | { ready: false; reason: string };

export function planProfessionalAutoReview(candidate: ProfessionalAutoReviewCandidate): ProfessionalAutoReviewPlan {
  if (!candidate.profileId.trim() || !candidate.ownerUserId.trim() ||
      !candidate.serviceActorUserId.trim() ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(candidate.expectedRevision)) {
    return { ready: false, reason: 'invalid_review_identity_or_revision' };
  }
  const decision = assessSmartAdminEligibility({
    domain: 'professional_content',
    submitted: candidate.submitted,
    snapshotComplete: candidate.snapshotComplete,
    revisionMatches: candidate.snapshotRevision === candidate.expectedRevision,
    ownerIsReviewer: candidate.ownerUserId === candidate.serviceActorUserId,
    flagged: candidate.flagged,
    categoryAllowed: candidate.categoryAllowed,
    checksPassed: candidate.checksPassed,
    policyVersion: candidate.policyVersion
  });
  if (!decision.eligible) return { ready: false, reason: decision.reason };
  return { ready: true, profileId: candidate.profileId, expectedRevision: candidate.expectedRevision,
    policyVersion: decision.policyVersion };
}
