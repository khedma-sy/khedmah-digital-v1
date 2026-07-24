import { TrustSubjectType } from './trust-types.mjs';

export const TrustSubjectBoundary = Object.freeze({
  USER_PROFILE_REFERENCE_ONLY: 'user_profile_reference_only',
  PROFESSIONAL_PROFILE_REFERENCE_ONLY: 'professional_profile_reference_only',
  BUSINESS_PROFILE_REFERENCE_ONLY: 'business_profile_reference_only',
  ORGANIZATION_PROFILE_REFERENCE_ONLY: 'organization_profile_reference_only',
  PARTNER_PROFILE_REFERENCE_ONLY: 'partner_profile_reference_only',
});

export function validateTrustSubjectReference(subject = {}) {
  const errors = [];
  if (!Object.values(TrustSubjectType).includes(subject.subjectType)) errors.push({ field: 'subjectType', code: 'TRUST_SUBJECT_INVALID', message: 'Trust subject type is unsupported.' });
  if (typeof subject.subjectRef !== 'string' || subject.subjectRef.length === 0) errors.push({ field: 'subjectRef', code: 'TRUST_SUBJECT_INVALID', message: 'Trust subject reference is required.' });
  if (subject.ownsUser || subject.ownsBusiness || subject.ownsService || subject.ownsOrganization) errors.push({ field: 'subjectRef', code: 'TRUST_SUBJECT_INVALID', message: 'Trust only references subjects and must not own users, businesses, services, or organizations.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
