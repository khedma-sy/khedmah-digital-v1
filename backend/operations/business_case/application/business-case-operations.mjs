import { attachDecision, attachRegistration, attachVerification, createBusinessCase, transitionBusinessCase } from '../domain/business-case.mjs';

// A case-scoped orchestration boundary: it consumes the canonical operation outputs
// from OP-001A/B/C and neither reimplements those operations nor persists data.
export function runBusinessCaseOperationalFlow({ caseInput, registration, verification, decision, timestamps, existingCaseIdentifiers = [] }) {
  let businessCase = createBusinessCase(caseInput, { existingCaseIdentifiers });
  businessCase = transitionBusinessCase(businessCase, 'ACTIVE', timestamps.activated);
  businessCase = attachRegistration(businessCase, registration, timestamps.registrationAttached);
  businessCase = attachVerification(businessCase, verification, timestamps.verificationAttached);
  businessCase = attachDecision(businessCase, decision, timestamps.decisionAttached);
  businessCase = transitionBusinessCase(businessCase, 'COMPLETED', timestamps.completed);
  return businessCase;
}

