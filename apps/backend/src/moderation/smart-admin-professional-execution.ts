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
  const revisionPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
  const validRevision = (revision: string): boolean => {
    if (!revisionPattern.test(revision)) return false;
    const date = new Date(revision.replace(/(\.\d{3})\d{3}Z$/, '$1Z'));
    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 19) === revision.slice(0, 19);
  };
  if (!candidate.profileId.trim() || !candidate.ownerUserId.trim() ||
      !candidate.serviceActorUserId.trim() ||
      candidate.profileId !== candidate.profileId.trim() ||
      candidate.ownerUserId !== candidate.ownerUserId.trim() ||
      candidate.serviceActorUserId !== candidate.serviceActorUserId.trim() ||
      !validRevision(candidate.expectedRevision) ||
      !validRevision(candidate.snapshotRevision) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(candidate.policyVersion)) {
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

/**
 * Bind a prepared plan to an independently authenticated service principal.
 * The caller must obtain principal identity and permissions from trusted server
 * authentication, never from candidate/request fields. This is NOT a writer.
 */
export type AuthenticatedProfessionalReviewPrincipal = {
  userId: string;
  isServiceIdentity: boolean;
  canApproveProfessionalContent: boolean;
};

export function authorizeProfessionalAutoReviewPlan(
  plan: ProfessionalAutoReviewPlan,
  candidate: ProfessionalAutoReviewCandidate,
  principal: AuthenticatedProfessionalReviewPrincipal | null
): ProfessionalAutoReviewPlan {
  if (!plan.ready) return plan;
  // Never trust a caller-supplied ready plan: recompute every policy and risk gate.
  const verifiedPlan = planProfessionalAutoReview(candidate);
  if (!verifiedPlan.ready) return verifiedPlan;
  if (!principal || !principal.isServiceIdentity || !principal.canApproveProfessionalContent ||
      !principal.userId.trim() || principal.userId !== principal.userId.trim() ||
      principal.userId !== candidate.serviceActorUserId ||
      principal.userId === candidate.ownerUserId ||
      plan.profileId !== candidate.profileId ||
      plan.expectedRevision !== candidate.expectedRevision ||
      plan.policyVersion !== candidate.policyVersion) {
    return { ready: false, reason: 'untrusted_or_unauthorized_service_principal' };
  }
  return plan;
}
