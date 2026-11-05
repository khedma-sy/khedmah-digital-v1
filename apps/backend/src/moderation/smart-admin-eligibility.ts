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
  // Sensitive approvals cannot be inferred from content-level automation checks.
  if (['identity_verification', 'driver_document', 'vehicle_document', 'taxi_activation'].includes(input.domain)) {
    return { eligible: false, reason: 'sensitive_domain_requires_independent_verified_workflow' };
  }
  if (!input.submitted) return { eligible: false, reason: 'not_submitted' };
  if (!input.snapshotComplete) return { eligible: false, reason: 'incomplete_review_snapshot' };
  if (!input.revisionMatches) return { eligible: false, reason: 'stale_revision' };
  if (input.ownerIsReviewer) return { eligible: false, reason: 'self_approval' };
  if (input.flagged) return { eligible: false, reason: 'risk_flag' };
  if (!input.policyVersion?.trim()) return { eligible: false, reason: 'missing_policy_version' };
  if (!input.categoryAllowed) return { eligible: false, reason: 'category_not_allowed' };
  if (!input.checksPassed) return { eligible: false, reason: 'checks_incomplete_or_failed' };
  return { eligible: true, policyVersion: input.policyVersion };
}
