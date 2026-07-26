export class PublicBusinessProfileError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PublicBusinessProfileError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export const PublicBusinessProfileErrorCode = Object.freeze({
  MISSING_VISIBILITY: 'MISSING_BUSINESS_VISIBILITY',
  INVALID_VISIBILITY: 'INVALID_BUSINESS_VISIBILITY',
  MISSING_PUBLICATION: 'MISSING_BUSINESS_PUBLICATION',
  MISSING_BUSINESS_CASE: 'MISSING_BUSINESS_CASE',
  DUPLICATE_PROFILE: 'DUPLICATE_PUBLIC_BUSINESS_PROFILE',
  INVALID_PUBLIC_EXPOSURE: 'INVALID_PUBLIC_EXPOSURE',
  UNAUTHORIZED_VISIBILITY: 'UNAUTHORIZED_PUBLIC_VISIBILITY',
  POLICY_VIOLATION: 'PUBLIC_EXPOSURE_POLICY_VIOLATION',
});

