/**
 * Conservative, side-effect-free eligibility gate. No authority to perform a review,
 * verify identity, approve documents, or activate Taxi is granted by this function.
 */
export type SmartAdminDomain =
  | 'professional_content' | 'business_content' | 'classified_content' | 'product_content'
  | 'identity_verification' | 'driver_document' | 'vehicle_document' | 'taxi_activation';

export type SmartAdminEligibilityInput = {
  domain: SmartAdminDomain;
  submitted: boolean;
  snapshotComplete: boolean;
  revisionMatches: boolean;
  ownerIsReviewer: boolean;
  flagged: boolean;
  policyVersion?: string;
  categoryAllowed: boolean;
  checksPassed: boolean;
};

export type SmartAdminEligibility =
  | { eligible: true; policyVersion: string }
  | { eligible: false; reason: string };

export function assessSmartAdminEligibility(input: SmartAdminEligibilityInput): SmartAdminEligibility {
  // Runtime callers can bypass TypeScript (JSON, JavaScript, or a changed API).
  // Invalid shapes must be denied rather than throwing or accepting truthy strings.
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { eligible: false, reason: 'invalid_input' };
  }
  // Sensitive approvals cannot be inferred from content-level automation checks.
  if (['identity_verification', 'driver_document', 'vehicle_document', 'taxi_activation'].includes(input.domain)) {
    return { eligible: false, reason: 'sensitive_domain_requires_independent_verified_workflow' };
  }
  // Treat unrecognized runtime values as untrusted, even if TypeScript callers are typed.
  // An unknown domain must never acquire routine content approval eligibility.
  if (!['professional_content', 'business_content', 'classified_content', 'product_content'].includes(input.domain)) {
    return { eligible: false, reason: 'unknown_domain' };
  }
  if (input.submitted !== true) return { eligible: false, reason: 'not_submitted' };
  if (input.snapshotComplete !== true) return { eligible: false, reason: 'incomplete_review_snapshot' };
  if (input.revisionMatches !== true) return { eligible: false, reason: 'stale_revision' };
  if (input.ownerIsReviewer !== false) return { eligible: false, reason: 'self_approval' };
  if (input.flagged !== false) return { eligible: false, reason: 'risk_flag' };
  if (typeof input.policyVersion !== 'string' || !input.policyVersion.trim()) return { eligible: false, reason: 'missing_policy_version' };
  if (input.categoryAllowed !== true) return { eligible: false, reason: 'category_not_allowed' };
  if (input.checksPassed !== true) return { eligible: false, reason: 'checks_incomplete_or_failed' };
  return { eligible: true, policyVersion: input.policyVersion };
}
