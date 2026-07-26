import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { buildCanonicalOperationalContext, executeDecisionAdapter, executeRegistrationAdapter, executeVerificationAdapter } from '../backend/operations/canonical_adapters/application/canonical-operational-adapters.mjs';
import { executeAuthenticatedAuthorityTransport, resolveTransportedGovernance } from '../backend/operations/authority_transport/application/authenticated-authority-transport.mjs';
import { AuthoritySource, AuthorityTransportState, createAuthoritySigningPayload } from '../backend/operations/authority_transport/domain/authority-transport.mjs';
import { AuthorityTransportErrorCode } from '../backend/operations/authority_transport/domain/authority-transport-errors.mjs';
import { CanonicalPermission } from '../backend/operations/governance_resolution/domain/governance-resolution.mjs';
import { executeCompleteOperationalChain } from './support/complete-operational-chain.mjs';

const correlationIdentifier = 'correlation:integration:003a';
const policyKeys = generateKeyPairSync('ed25519');
const roleKeys = generateKeyPairSync('ed25519');
const authorityRegistry = {
  [AuthoritySource.POLICY]: { authorityIdentifier: 'authority:policy:004a', publicKey: policyKeys.publicKey },
  [AuthoritySource.ROLE]: { authorityIdentifier: 'authority:role:004a', publicKey: roleKeys.publicKey },
};
const resolverLineage = { businessRequestReference: 'request:004a', caseIdentifier: 'case:integration:003a', decisionReference: 'decision:integration:003a', operationalStatusReference: 'status:integration:003a', correlationIdentifier };
const resolverEvidence = (type) => ({ creationEvidence: { recordedAt: '2026-07-26T07:00:00Z', auditReference: `audit:${type}:created` }, validationEvidence: { recordedAt: '2026-07-26T07:01:00Z', auditReference: `audit:${type}:validated` }, bindingEvidence: { recordedAt: '2026-07-26T07:02:00Z', auditReference: `audit:${type}:bound` } });

function envelope(source, authorityIdentifier, privateKey, payload, overrides = {}) {
  const unsigned = { envelopeIdentifier: `envelope:${source}:004a`, authorityIdentifier, authoritySource: source, authorityTimestamp: '2026-07-26T06:55:00Z', authorityVersion: '1', correlationIdentifier, payload, ...overrides };
  return { ...unsigned, integrity: { algorithm: 'Ed25519', signature: sign(null, createAuthoritySigningPayload(unsigned), privateKey).toString('base64') }, receiptEvidence: { recordedAt: '2026-07-26T06:56:00Z', auditReference: `audit:${source}:received` }, authenticationEvidence: { recordedAt: '2026-07-26T06:57:00Z', auditReference: `audit:${source}:authenticated` }, verificationEvidence: { recordedAt: '2026-07-26T06:58:00Z', auditReference: `audit:${source}:verified` } };
}
const policyPayload = { resolutionIdentifier: 'resolution:policy:004a', ...resolverLineage, output: { policyReference: 'policy:integration:003a', permissions: Object.values(CanonicalPermission) }, ...resolverEvidence('policy') };
const rolePayload = { resolutionIdentifier: 'resolution:role:004a', ...resolverLineage, output: { responsibleRole: 'INTEGRATION_GOVERNANCE_OFFICER', authorizedRoles: ['INTEGRATION_GOVERNANCE_OFFICER'] }, ...resolverEvidence('role') };
const trust = (overrides = {}) => ({ authorityRegistry, expectedCorrelationIdentifier: correlationIdentifier, now: '2026-07-26T07:00:00Z', maxAgeMs: 10 * 60 * 1000, ...overrides });

function adapters() {
  const base = (adapterIdentifier, outputReference, minute) => ({ adapterIdentifier, outputReference, businessRequestReference: resolverLineage.businessRequestReference, caseIdentifier: resolverLineage.caseIdentifier, correlationIdentifier, policyReference: 'policy:integration:003a', recordedAt: `2026-07-26T06:0${minute}:00Z`, auditReference: `audit:${adapterIdentifier}:created`, validationEvidence: { recordedAt: `2026-07-26T06:1${minute}:00Z`, auditReference: `audit:${adapterIdentifier}:validated` }, bindingEvidence: { recordedAt: `2026-07-26T06:2${minute}:00Z`, auditReference: `audit:${adapterIdentifier}:bound` } });
  const registrationAdapter = executeRegistrationAdapter(base('adapter:registration:004a', 'registration:integration:003a', 1));
  const verificationAdapter = executeVerificationAdapter(base('adapter:verification:004a', 'verification:integration:003a', 2), registrationAdapter);
  const decisionAdapter = executeDecisionAdapter(base('adapter:decision:004a', resolverLineage.decisionReference, 3), verificationAdapter);
  return buildCanonicalOperationalContext({ registrationAdapter, verificationAdapter, decisionAdapter });
}

test('unit: authenticates and verifies valid signed authority with auditable lifecycle', () => {
  const verified = executeAuthenticatedAuthorityTransport(envelope(AuthoritySource.POLICY, 'authority:policy:004a', policyKeys.privateKey, policyPayload), trust());
  assert.equal(verified.state, AuthorityTransportState.VERIFIED);
  assert.deepEqual(verified.history.map(({ currentState }) => currentState), ['RECEIVED', 'AUTHENTICATED', 'VERIFIED']);
  assert.ok(Object.isFrozen(verified.payload.output.permissions));
});

test('unit: rejects missing/invalid authority, unknown source, invalid integrity, duplicate and correlation', () => {
  const valid = envelope(AuthoritySource.POLICY, 'authority:policy:004a', policyKeys.privateKey, policyPayload);
  assert.throws(() => executeAuthenticatedAuthorityTransport({ ...valid, authorityIdentifier: '' }, trust()), { code: AuthorityTransportErrorCode.MISSING_AUTHORITY });
  assert.throws(() => executeAuthenticatedAuthorityTransport(envelope('UNKNOWN', 'authority:unknown', policyKeys.privateKey, policyPayload), trust()), { code: AuthorityTransportErrorCode.UNKNOWN_SOURCE });
  assert.throws(() => executeAuthenticatedAuthorityTransport(envelope(AuthoritySource.POLICY, 'authority:other', policyKeys.privateKey, policyPayload), trust()), { code: AuthorityTransportErrorCode.INVALID_IDENTITY });
  assert.throws(() => executeAuthenticatedAuthorityTransport({ ...valid, integrity: { ...valid.integrity, signature: Buffer.from('invalid').toString('base64') } }, trust()), { code: AuthorityTransportErrorCode.INVALID_INTEGRITY });
  assert.throws(() => executeAuthenticatedAuthorityTransport(valid, trust(), { existingEnvelopeIdentifiers: [valid.envelopeIdentifier] }), { code: AuthorityTransportErrorCode.DUPLICATE_AUTHORITY });
  assert.throws(() => executeAuthenticatedAuthorityTransport(valid, trust({ expectedCorrelationIdentifier: 'correlation:other' })), { code: AuthorityTransportErrorCode.INVALID_CORRELATION });
});

test('unit: rejects expired authority envelope', () => {
  const expired = envelope(AuthoritySource.POLICY, 'authority:policy:004a', policyKeys.privateKey, policyPayload, { authorityTimestamp: '2026-07-26T06:00:00Z' });
  assert.throws(() => executeAuthenticatedAuthorityTransport(expired, trust()), { code: AuthorityTransportErrorCode.EXPIRED_AUTHORITY });
});

test('integration and end-to-end: authenticated transport drives OP-003C and unchanged lifecycle', () => {
  const operationalContext = adapters();
  const policyEnvelope = executeAuthenticatedAuthorityTransport(envelope(AuthoritySource.POLICY, 'authority:policy:004a', policyKeys.privateKey, policyPayload), trust());
  const roleEnvelope = executeAuthenticatedAuthorityTransport(envelope(AuthoritySource.ROLE, 'authority:role:004a', roleKeys.privateKey, rolePayload), trust());
  const governanceContext = resolveTransportedGovernance({ policyEnvelope, roleEnvelope, operationalContext });
  const chain = executeCompleteOperationalChain({ operationalContext, governanceContext });
  assert.equal(governanceContext.policyResolution.authorityReference, policyEnvelope.authorityIdentifier);
  assert.equal(governanceContext.roleResolution.authorityReference, roleEnvelope.authorityIdentifier);
  assert.equal(chain.approved.approval.status, 'APPROVED');
  assert.equal(chain.published.publication.status, 'PUBLISHED');
  assert.equal(chain.visible.visibility.status, 'VISIBLE');
  assert.equal(chain.discovered.discovery.status, 'DISCOVERABLE');
  assert.equal(chain.searched.search.status, 'SEARCHABLE');
  assert.equal(chain.searched.results[0].businessName, 'خدمة التكامل');
});

