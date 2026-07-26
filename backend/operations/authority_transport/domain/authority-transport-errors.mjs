export class AuthorityTransportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AuthorityTransportError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export const AuthorityTransportErrorCode = Object.freeze({
  MISSING_AUTHORITY: 'MISSING_AUTHORITY',
  UNKNOWN_SOURCE: 'UNKNOWN_AUTHORITY_SOURCE',
  INVALID_IDENTITY: 'INVALID_AUTHORITY_IDENTITY',
  INVALID_INTEGRITY: 'INVALID_AUTHORITY_INTEGRITY',
  DUPLICATE_AUTHORITY: 'DUPLICATE_AUTHORITY_ENVELOPE',
  INVALID_CORRELATION: 'INVALID_AUTHORITY_CORRELATION',
  EXPIRED_AUTHORITY: 'EXPIRED_AUTHORITY_ENVELOPE',
  INVALID_ENVELOPE: 'INVALID_AUTHORITY_ENVELOPE',
  INVALID_LIFECYCLE: 'INVALID_AUTHORITY_TRANSPORT_LIFECYCLE',
});

