import { assessSmartAdminEligibility } from './smart-admin-eligibility';
import type { DatabasePool } from '../database/database.pool';
import { PROFILE_REVISION_SQL } from './profile-review-write';
import { PROFESSIONAL_REVIEW_EVIDENCE_EXPRESSION } from './professional-review-evidence';

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
  // Treat runtime inputs as untrusted even when TypeScript callers declare a type.
  if (!candidate || typeof candidate !== 'object' ||
      !['profileId', 'expectedRevision', 'snapshotRevision', 'ownerUserId',
        'serviceActorUserId', 'policyVersion'].every((key) =>
        typeof candidate[key as keyof ProfessionalAutoReviewCandidate] === 'string') ||
      !['submitted', 'snapshotComplete', 'flagged', 'categoryAllowed',
        'checksPassed'].every((key) =>
        typeof candidate[key as keyof ProfessionalAutoReviewCandidate] === 'boolean')) {
    return { ready: false, reason: 'invalid_review_candidate' };
  }
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
  if (!plan || typeof plan !== 'object' || typeof plan.ready !== 'boolean') {
    return { ready: false, reason: 'invalid_review_plan' };
  }
  if (!plan.ready) return plan;
  // Never trust a caller-supplied ready plan: recompute every policy and risk gate.
  const verifiedPlan = planProfessionalAutoReview(candidate);
  if (!verifiedPlan.ready) return verifiedPlan;
  if (!principal || typeof principal.userId !== 'string' ||
      principal.isServiceIdentity !== true || principal.canApproveProfessionalContent !== true ||
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

/**
 * Read-only profile state from the canonical PostgreSQL table. This is a
 * trusted SERVER-SIDE lookup: never replace it with fields from a browser body.
 * No content policy passes are inferred from these database columns.
 */
export type CanonicalProfessionalReviewState = {
  profileId: string;
  expectedRevision: string;
  ownerUserId: string;
  moderationStatus: string;
  lifecycleStatus: string;
  visibility: string;
  snapshotFingerprint: string;
};

export async function readCanonicalProfessionalReviewState(
  db: Pick<DatabasePool, 'query'>,
  profileId: string
): Promise<CanonicalProfessionalReviewState | null> {
  const rows = await db.query<{
    profile_id: string; owner_user_id: string; revision: string;
    moderation_status: string; lifecycle_status: string; visibility: string;
    evidence_fingerprint: string;
  }>(
    `SELECT p.professional_profile_identifier AS profile_id,
       p.user_identifier AS owner_user_id,
       ${PROFILE_REVISION_SQL} AS revision,
       p.moderation_status, p.lifecycle_status, p.visibility,
       ${PROFESSIONAL_REVIEW_EVIDENCE_EXPRESSION} AS evidence_fingerprint
       FROM professional_profiles p WHERE p.professional_profile_identifier=$1 LIMIT 1`,
    [profileId]
  );
  const row = rows[0];
  return row ? {
    profileId: row.profile_id, expectedRevision: row.revision,
    ownerUserId: row.owner_user_id, moderationStatus: row.moderation_status,
    lifecycleStatus: row.lifecycle_status, visibility: row.visibility,
    snapshotFingerprint: row.evidence_fingerprint
  } : null;
}

export type ProfessionalReviewRequest = { profileId: string; expectedRevision: string };
export type TrustedProfessionalPolicyAssessment = Pick<
  ProfessionalAutoReviewCandidate,
  'snapshotRevision' | 'snapshotComplete' | 'flagged' | 'categoryAllowed' |
  'checksPassed' | 'policyVersion'
> & { snapshotFingerprint: string };

/**
 * Server-only handoff, NOT a route or worker. The request contributes ONLY
 * an ID and a compare-and-swap revision. Owner, status, and lifecycle must
 * come from canonical server-side database reads; policy evidence must come
 * from an independently executed server-side assessor; service identity and
 * permission must come from independently authenticated credentials.
 *
 * This does not implement a trusted policy assessor or service authentication,
 * and MUST NOT be enabled until those dependencies and the atomic evidence
 * recheck are in place. The writer still atomically validates profile revision,
 * moderation state, and audit insertion.
 */
export async function executeAuthorizedProfessionalReview(
  request: ProfessionalReviewRequest,
  loadCanonicalState: (profileId: string) => Promise<CanonicalProfessionalReviewState | null>,
  resolveTrustedPrincipal: () => Promise<AuthenticatedProfessionalReviewPrincipal | null>,
  assessTrustedPolicy: (state: CanonicalProfessionalReviewState) => Promise<TrustedProfessionalPolicyAssessment>,
  writeApprovedReview: (profileId: string, actorId: string, expectedRevision: string, expectedEvidenceFingerprint: string) => Promise<void>
): Promise<{ applied: true } | { applied: false; reason: string }> {
  if (!request || typeof request.profileId !== 'string' ||
      !request.profileId.trim() || request.profileId !== request.profileId.trim() ||
      typeof request.expectedRevision !== 'string') {
    return { applied: false, reason: 'invalid_review_request' };
  }
  const state = await loadCanonicalState(request.profileId);
  if (!state || typeof state !== 'object' ||
      state.profileId !== request.profileId || typeof state.ownerUserId !== 'string' ||
      typeof state.expectedRevision !== 'string' ||
      typeof state.snapshotFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(state.snapshotFingerprint)) {
    return { applied: false, reason: 'canonical_review_state_unavailable' };
  }
  if (state.expectedRevision !== request.expectedRevision) {
    return { applied: false, reason: 'stale_revision' };
  }
  if (state.moderationStatus !== 'pending' || state.lifecycleStatus !== 'pending' ||
      state.visibility !== 'public') {
    return { applied: false, reason: 'professional_review_not_pending_or_public' };
  }
  const principal = await resolveTrustedPrincipal();
  if (!principal || typeof principal.userId !== 'string' ||
      principal.isServiceIdentity !== true || principal.canApproveProfessionalContent !== true ||
      !principal.userId.trim() || principal.userId !== principal.userId.trim() ||
      principal.userId === state.ownerUserId) {
    return { applied: false, reason: 'untrusted_or_unauthorized_service_principal' };
  }
  const policy = await assessTrustedPolicy(state);
  if (!policy || typeof policy !== 'object') {
    return { applied: false, reason: 'missing_verified_policy_evidence' };
  }
  if (typeof policy.snapshotFingerprint !== 'string' ||
      policy.snapshotFingerprint !== state.snapshotFingerprint) {
    return { applied: false, reason: 'stale_review_evidence' };
  }
  const candidate: ProfessionalAutoReviewCandidate = {
    profileId: state.profileId, expectedRevision: state.expectedRevision,
    ownerUserId: state.ownerUserId, serviceActorUserId: principal.userId,
    submitted: true, snapshotRevision: policy.snapshotRevision,
    snapshotComplete: policy.snapshotComplete, flagged: policy.flagged,
    categoryAllowed: policy.categoryAllowed, checksPassed: policy.checksPassed,
    policyVersion: policy.policyVersion
  };
  const plan = planProfessionalAutoReview(candidate);
  if (!plan.ready) return { applied: false, reason: plan.reason };
  const authorized = authorizeProfessionalAutoReviewPlan(plan, candidate, principal);
  if (!authorized.ready) return { applied: false, reason: authorized.reason };
  // The trusted writer must atomically revalidate status, revision and audit;
  // no positive result may be returned when the writer fails.
  await writeApprovedReview(authorized.profileId, principal.userId, authorized.expectedRevision,
    state.snapshotFingerprint);
  return { applied: true };
}
