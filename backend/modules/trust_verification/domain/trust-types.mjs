import { ProfileVisibility } from '../../profiles/domain/profile-types.mjs';

export const TrustConcept = Object.freeze({
  TRUST_RECORD: 'Trust Record',
  VERIFICATION_REFERENCE: 'Verification Reference',
  VERIFICATION_TYPE: 'Verification Type',
  TRUST_STATUS: 'Trust Status',
  VERIFICATION_STATUS: 'Verification Status',
  TRUST_VISIBILITY: 'Trust Visibility',
  TRUST_SUBJECT_REFERENCE: 'Trust Subject Reference',
  TRUST_LEVEL_REFERENCE: 'Trust Level Reference',
});

export const TrustSubjectType = Object.freeze({
  USER_PROFILE: 'user_profile',
  PROFESSIONAL_PROFILE: 'professional_profile',
  BUSINESS_PROFILE: 'business_profile',
  ORGANIZATION_PROFILE: 'organization_profile',
  PARTNER_PROFILE: 'partner_profile',
});

export const VerificationType = Object.freeze({
  IDENTITY_VERIFICATION: 'identity_verification',
  BUSINESS_VERIFICATION: 'business_verification',
  PROFESSIONAL_VERIFICATION: 'professional_verification',
  ORGANIZATION_VERIFICATION: 'organization_verification',
});

export const TrustStatus = Object.freeze({
  UNKNOWN: 'unknown',
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
});

export const VerificationStatus = Object.freeze({
  UNKNOWN: TrustStatus.UNKNOWN,
  PENDING: TrustStatus.PENDING,
  VERIFIED: TrustStatus.VERIFIED,
  REJECTED: TrustStatus.REJECTED,
  SUSPENDED: TrustStatus.SUSPENDED,
  EXPIRED: TrustStatus.EXPIRED,
});

export const TrustVisibility = Object.freeze({
  PUBLIC: ProfileVisibility.PUBLIC,
  PRIVATE: ProfileVisibility.PRIVATE,
  INTERNAL: ProfileVisibility.INTERNAL,
});

export const TrustLevelReference = Object.freeze({
  UNKNOWN: 'trust_level:unknown',
  BASIC_REFERENCE: 'trust_level:basic_reference',
  VERIFIED_REFERENCE: 'trust_level:verified_reference',
  SUSPENDED_REFERENCE: 'trust_level:suspended_reference',
});

export const REQUIRED_TRUST_FIELDS = Object.freeze(['trustRecordRef', 'verificationRef', 'subjectRef', 'subjectType', 'verificationType', 'trustStatus', 'verificationStatus', 'trustLevelRef', 'visibility']);
export const TRUST_RECORD_REFERENCE_PATTERN = /^trust_record:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const VERIFICATION_REFERENCE_PATTERN = /^verification_ref:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const TRUST_SUBJECT_REFERENCE_PATTERN = /^(user_profile|professional_profile|business_profile|organization_profile|partner_profile):[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const TRUST_LEVEL_REFERENCE_PATTERN = /^trust_level:[a-z0-9][a-z0-9._:-]{2,127}$/i;
