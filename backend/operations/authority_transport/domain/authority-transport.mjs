import { verify } from 'node:crypto';
import { AuthorityTransportError, AuthorityTransportErrorCode } from './authority-transport-errors.mjs';

export const AuthoritySource = Object.freeze({ POLICY: 'POLICY_AUTHORITY', ROLE: 'ROLE_AUTHORITY' });
export const AuthorityTransportState = Object.freeze({ RECEIVED: 'RECEIVED', AUTHENTICATED: 'AUTHENTICATED', VERIFIED: 'VERIFIED' });

const requireText = (value, field, code = AuthorityTransportErrorCode.INVALID_ENVELOPE) => {
  if (typeof value !== 'string' || value.trim() === '') throw new AuthorityTransportError(code, `${field} is required.`, { field });
  return value.trim();
};
const freezeValue = (value) => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
  return value;
};
const canonicalize = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
export const createAuthoritySigningPayload = (input) => Buffer.from(canonicalize({ authorityIdentifier: input.authorityIdentifier, authoritySource: input.authoritySource, authorityTimestamp: input.authorityTimestamp, authorityVersion: input.authorityVersion, correlationIdentifier: input.correlationIdentifier, payload: input.payload }), 'utf8');
const historyEntry = (envelope, state, evidence) => freezeValue({ sequence: envelope.version + 1, previousState: envelope.state ?? null, currentState: state, envelopeIdentifier: envelope.envelopeIdentifier, authorityIdentifier: envelope.authorityIdentifier, correlationIdentifier: envelope.correlationIdentifier, recordedAt: requireText(evidence?.recordedAt, 'recordedAt'), auditReference: requireText(evidence?.auditReference, 'auditReference') });

export function receiveAuthorityEnvelope(input, { existingEnvelopeIdentifiers = [] } = {}) {
  const envelopeIdentifier = requireText(input?.envelopeIdentifier, 'envelopeIdentifier');
  if (existingEnvelopeIdentifiers.includes(envelopeIdentifier)) throw new AuthorityTransportError(AuthorityTransportErrorCode.DUPLICATE_AUTHORITY, 'Authority envelope identifier already exists.');
  if (!input?.authorityIdentifier) throw new AuthorityTransportError(AuthorityTransportErrorCode.MISSING_AUTHORITY, 'Authority identifier is required.');
  const base = { envelopeIdentifier, authorityIdentifier: requireText(input.authorityIdentifier, 'authorityIdentifier'), authoritySource: input.authoritySource, authorityTimestamp: requireText(input.authorityTimestamp, 'authorityTimestamp'), authorityVersion: requireText(input.authorityVersion, 'authorityVersion'), correlationIdentifier: requireText(input.correlationIdentifier, 'correlationIdentifier', AuthorityTransportErrorCode.INVALID_CORRELATION), integrity: { algorithm: input.integrity?.algorithm, signature: requireText(input.integrity?.signature, 'signature', AuthorityTransportErrorCode.INVALID_INTEGRITY) }, payload: input.payload, version: 0, state: null, history: [] };
  const received = historyEntry(base, AuthorityTransportState.RECEIVED, input.receiptEvidence);
  return freezeValue({ ...base, version: 1, state: AuthorityTransportState.RECEIVED, history: [received] });
}

export function authenticateAuthorityEnvelope(envelope, authorityRegistry, evidence) {
  if (envelope.state !== AuthorityTransportState.RECEIVED) throw new AuthorityTransportError(AuthorityTransportErrorCode.INVALID_LIFECYCLE, 'Only a RECEIVED envelope can be authenticated.');
  if (!Object.values(AuthoritySource).includes(envelope.authoritySource)) throw new AuthorityTransportError(AuthorityTransportErrorCode.UNKNOWN_SOURCE, 'Authority source is unknown.');
  const authority = authorityRegistry?.[envelope.authoritySource];
  if (!authority) throw new AuthorityTransportError(AuthorityTransportErrorCode.UNKNOWN_SOURCE, 'Authority source is not registered.');
  if (authority.authorityIdentifier !== envelope.authorityIdentifier || !authority.publicKey) throw new AuthorityTransportError(AuthorityTransportErrorCode.INVALID_IDENTITY, 'Authority identity does not match the trusted registry.');
  const authenticated = historyEntry(envelope, AuthorityTransportState.AUTHENTICATED, evidence);
  return freezeValue({ ...envelope, version: envelope.version + 1, state: AuthorityTransportState.AUTHENTICATED, history: [...envelope.history, authenticated] });
}

export function verifyAuthorityEnvelope(envelope, authorityRegistry, { expectedCorrelationIdentifier, now, maxAgeMs, evidence }) {
  if (envelope.state !== AuthorityTransportState.AUTHENTICATED) throw new AuthorityTransportError(AuthorityTransportErrorCode.INVALID_LIFECYCLE, 'Only an AUTHENTICATED envelope can be verified.');
  if (envelope.correlationIdentifier !== expectedCorrelationIdentifier) throw new AuthorityTransportError(AuthorityTransportErrorCode.INVALID_CORRELATION, 'Authority correlation identifier does not match.');
  const issuedAt = Date.parse(envelope.authorityTimestamp);
  const verifiedAt = Date.parse(now);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(verifiedAt) || issuedAt > verifiedAt || verifiedAt - issuedAt > maxAgeMs) throw new AuthorityTransportError(AuthorityTransportErrorCode.EXPIRED_AUTHORITY, 'Authority envelope is expired or has an invalid timestamp.');
  if (envelope.integrity.algorithm !== 'Ed25519') throw new AuthorityTransportError(AuthorityTransportErrorCode.INVALID_INTEGRITY, 'Authority integrity algorithm is unsupported.');
  const authority = authorityRegistry[envelope.authoritySource];
  const signature = Buffer.from(envelope.integrity.signature, 'base64');
  if (!verify(null, createAuthoritySigningPayload(envelope), authority.publicKey, signature)) throw new AuthorityTransportError(AuthorityTransportErrorCode.INVALID_INTEGRITY, 'Authority envelope signature is invalid.');
  const verified = historyEntry(envelope, AuthorityTransportState.VERIFIED, evidence);
  return freezeValue({ ...envelope, version: envelope.version + 1, state: AuthorityTransportState.VERIFIED, history: [...envelope.history, verified] });
}

