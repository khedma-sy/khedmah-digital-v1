export const TrustOwnershipBoundary = Object.freeze({
  TRUST_REFERENCES_SUBJECTS_ONLY: 'trust_references_subjects_only',
  TRUST_DOES_NOT_OWN_USERS: 'trust_does_not_own_users',
  TRUST_DOES_NOT_OWN_BUSINESSES: 'trust_does_not_own_businesses',
  TRUST_DOES_NOT_OWN_SERVICES: 'trust_does_not_own_services',
  TRUST_DOES_NOT_OWN_ORGANIZATIONS: 'trust_does_not_own_organizations',
});

export const ForbiddenTrustOwnershipRule = Object.freeze({
  TRUST_OWNERSHIP: 'trust_ownership',
  PAID_TRUST: 'paid_trust',
  RANKING_ADVANTAGE: 'ranking_advantage',
  ADVERTISING_ADVANTAGE: 'advertising_advantage',
});

export function validateTrustOwnershipBoundary(value = {}) {
  const errors = [];
  if (value.trustOwnerRef || value.trustOwnsSubject === true) errors.push({ field: 'trustOwnerRef', code: 'TRUST_SUBJECT_INVALID', message: 'Trust records cannot own referenced subjects.' });
  if (value.paidTrustRef || value.paymentVerificationRef) errors.push({ field: 'paidTrustRef', code: 'TRUST_INVALID', message: 'Paid trust and payment verification are forbidden.' });
  if (value.rankingAdvantageRef || value.advertisingAdvantageRef) errors.push({ field: 'trustAdvantageRef', code: 'TRUST_INVALID', message: 'Trust must not create ranking or advertising advantages.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
