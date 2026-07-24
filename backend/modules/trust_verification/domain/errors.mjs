import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const TrustVerificationErrorCode = Object.freeze({
  TRUST_INVALID: 'TRUST_INVALID',
  VERIFICATION_INVALID: 'VERIFICATION_INVALID',
  TRUST_STATUS_INVALID: 'TRUST_STATUS_INVALID',
  TRUST_SUBJECT_INVALID: 'TRUST_SUBJECT_INVALID',
  TRUST_VISIBILITY_INVALID: 'TRUST_VISIBILITY_INVALID',
});

const TrustVerificationErrorCategory = Object.freeze({
  [TrustVerificationErrorCode.TRUST_INVALID]: ErrorCategory.VALIDATION,
  [TrustVerificationErrorCode.VERIFICATION_INVALID]: ErrorCategory.VALIDATION,
  [TrustVerificationErrorCode.TRUST_STATUS_INVALID]: ErrorCategory.LIFECYCLE,
  [TrustVerificationErrorCode.TRUST_SUBJECT_INVALID]: ErrorCategory.RELATIONSHIP,
  [TrustVerificationErrorCode.TRUST_VISIBILITY_INVALID]: ErrorCategory.AUTHORIZATION,
});

export function createTrustVerificationError(code, message, metadata = {}) {
  return new KhedmahCoreError({ code, message, category: TrustVerificationErrorCategory[code] || ErrorCategory.SYSTEM, metadata });
}
