export class CanonicalAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CanonicalAdapterError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export const CanonicalAdapterErrorCode = Object.freeze({
  INVALID_ADAPTER: 'INVALID_CANONICAL_ADAPTER',
  MISSING_ADAPTER: 'MISSING_CANONICAL_ADAPTER',
  DUPLICATE_ADAPTER: 'DUPLICATE_CANONICAL_ADAPTER',
  INVALID_LINKAGE: 'INVALID_CANONICAL_ADAPTER_LINKAGE',
  INVALID_LIFECYCLE: 'INVALID_CANONICAL_ADAPTER_LIFECYCLE',
  INCOMPATIBLE_CAPABILITY: 'INCOMPATIBLE_BUSINESS_CAPABILITY_BINDING',
});

