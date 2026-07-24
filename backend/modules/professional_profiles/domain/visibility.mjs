import { ProfessionalVisibility } from './professional-types.mjs';

export const ProfessionalVisibilityClass = Object.freeze({
  [ProfessionalVisibility.PUBLIC]: Object.freeze(['professionalDisplayIdentity', 'professionCategoryRef']),
  [ProfessionalVisibility.PRIVATE]: Object.freeze(['privateContactRef']),
  [ProfessionalVisibility.INTERNAL]: Object.freeze(['operationalMetadataRef']),
});

export function isProfessionalVisibility(value) {
  return Object.values(ProfessionalVisibility).includes(value);
}

export function validateProfessionalVisibilityExposure({ visibility, fieldClass, exposesVerificationData = false }) {
  const errors = [];
  if (!isProfessionalVisibility(visibility)) errors.push({ field: 'visibility', code: 'PROFESSIONAL_VISIBILITY_INVALID', message: 'Professional visibility must be public, private, or internal.' });
  if (visibility === ProfessionalVisibility.PUBLIC && (fieldClass === ProfessionalVisibility.PRIVATE || fieldClass === ProfessionalVisibility.INTERNAL)) errors.push({ field: 'fieldClass', code: 'PROFESSIONAL_VISIBILITY_INVALID', message: 'Private or internal professional data must not be exposed publicly.' });
  if (exposesVerificationData === true) errors.push({ field: 'exposesVerificationData', code: 'PROFESSIONAL_VISIBILITY_INVALID', message: 'Verification data exposure is outside the professional profile foundation.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
