import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCanonicalOperationalContext, executeDecisionAdapter, executeRegistrationAdapter, executeVerificationAdapter } from '../backend/operations/canonical_adapters/application/canonical-operational-adapters.mjs';
import { CanonicalAdapterState } from '../backend/operations/canonical_adapters/domain/canonical-adapter.mjs';
import { CanonicalAdapterErrorCode } from '../backend/operations/canonical_adapters/domain/canonical-adapter-errors.mjs';
import { executeCompleteOperationalChain } from './support/complete-operational-chain.mjs';

const common = { businessRequestReference: 'request:003b', caseIdentifier: 'case:integration:003a', correlationIdentifier: 'correlation:integration:003a', policyReference: 'policy:integration:003a' };
const input = (adapterIdentifier, outputReference, minute) => ({ ...common, adapterIdentifier, outputReference, recordedAt: `2026-07-26T08:0${minute}:00Z`, auditReference: `audit:${adapterIdentifier}:created`, validationEvidence: { recordedAt: `2026-07-26T08:1${minute}:00Z`, auditReference: `audit:${adapterIdentifier}:validated` }, bindingEvidence: { recordedAt: `2026-07-26T08:2${minute}:00Z`, auditReference: `audit:${adapterIdentifier}:bound` } });

const adapters = () => {
  const registrationAdapter = executeRegistrationAdapter(input('adapter:registration:003b', 'registration:integration:003a', 1));
  const verificationAdapter = executeVerificationAdapter(input('adapter:verification:003b', 'verification:integration:003a', 2), registrationAdapter);
  const decisionAdapter = executeDecisionAdapter(input('adapter:decision:003b', 'decision:integration:003a', 3), verificationAdapter);
  return { registrationAdapter, verificationAdapter, decisionAdapter };
};

test('unit: creates validated and bound canonical adapters with append-only audit lifecycle', () => {
  const values = Object.values(adapters());
  assert.ok(values.every((adapter) => adapter.state === CanonicalAdapterState.BOUND && adapter.version === 3));
  assert.ok(values.every((adapter) => adapter.history.map(({ currentState }) => currentState).join(',') === 'CREATED,VALIDATED,BOUND'));
  assert.ok(values.every((adapter) => Object.isFrozen(adapter.history)));
});

test('unit: rejects invalid, missing, duplicate, and incorrectly linked adapters', () => {
  assert.throws(() => executeRegistrationAdapter({ ...input('adapter:invalid', 'registration:invalid', 1), correlationIdentifier: '' }), { code: CanonicalAdapterErrorCode.INVALID_ADAPTER });
  assert.throws(() => executeRegistrationAdapter(input('adapter:registration:003b', 'registration:integration:003a', 1), { existingAdapterIdentifiers: ['adapter:registration:003b'] }), { code: CanonicalAdapterErrorCode.DUPLICATE_ADAPTER });
  assert.throws(() => executeVerificationAdapter(input('adapter:verification:003b', 'verification:integration:003a', 2), undefined), { code: CanonicalAdapterErrorCode.MISSING_ADAPTER });
  const registration = executeRegistrationAdapter(input('adapter:registration:003b', 'registration:integration:003a', 1));
  assert.throws(() => executeVerificationAdapter({ ...input('adapter:verification:003b', 'verification:integration:003a', 2), caseIdentifier: 'case:other' }, registration), { code: CanonicalAdapterErrorCode.INVALID_LINKAGE });
  assert.throws(() => buildCanonicalOperationalContext({ registrationAdapter: registration }), { code: CanonicalAdapterErrorCode.MISSING_ADAPTER });
});

test('integration: Business Request adapters supply canonical existing-capability inputs', () => {
  const context = buildCanonicalOperationalContext(adapters());
  assert.equal(context.businessRequestReference, 'request:003b');
  assert.equal(context.registration.reference, 'registration:integration:003a');
  assert.equal(context.verificationEvidence.status, 'COMPLETED');
  assert.equal(context.decision.verificationReference, context.verification.reference);
  assert.ok(context.adapters.every((adapter) => adapter.caseIdentifier === common.caseIdentifier));
});

test('end-to-end: canonical adapters execute through OP-001D to OP-002F without changing behavior', () => {
  const context = buildCanonicalOperationalContext(adapters());
  const chain = executeCompleteOperationalChain({ operationalContext: context });
  assert.deepEqual(chain.businessCase.references, { registration: context.registration.reference, verification: context.verification.reference, decision: context.decision.reference });
  assert.equal(chain.readyStatus.currentStatus, 'READY_FOR_APPROVAL');
  assert.equal(chain.approved.approval.status, 'APPROVED');
  assert.equal(chain.published.publication.status, 'PUBLISHED');
  assert.equal(chain.visible.visibility.status, 'VISIBLE');
  assert.equal(chain.discovered.discovery.status, 'DISCOVERABLE');
  assert.equal(chain.searched.search.status, 'SEARCHABLE');
  assert.equal(chain.searched.results[0].businessName, 'خدمة التكامل');
});

