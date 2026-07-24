import { BusinessVisibility } from './business-types.mjs';

export const BusinessVisibilityClass = Object.freeze({
  [BusinessVisibility.PUBLIC]: Object.freeze(['businessDisplayName', 'publicDescriptionRef', 'categoryRef']),
  [BusinessVisibility.PRIVATE]: Object.freeze(['privateContactRef']),
  [BusinessVisibility.INTERNAL]: Object.freeze(['operationalMetadataRef']),
});

export function isBusinessVisibility(value) {
  return Object.values(BusinessVisibility).includes(value);
}

export function validateBusinessVisibilityExposure({ visibility, fieldClass, exposesVerificationEvidence = false }) {
  const errors = [];
  if (!isBusinessVisibility(visibility)) errors.push({ field: 'visibility', code: 'BUSINESS_VISIBILITY_INVALID', message: 'Business visibility must be public, private, or internal.' });
  if (visibility === BusinessVisibility.PUBLIC && (fieldClass === BusinessVisibility.PRIVATE || fieldClass === BusinessVisibility.INTERNAL)) errors.push({ field: 'fieldClass', code: 'BUSINESS_VISIBILITY_INVALID', message: 'Private or internal business data must not be exposed publicly.' });
  if (exposesVerificationEvidence === true) errors.push({ field: 'exposesVerificationEvidence', code: 'BUSINESS_VISIBILITY_INVALID', message: 'Verification evidence exposure is outside the business profile foundation.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
