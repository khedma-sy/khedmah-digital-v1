import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBusinessCaseOperationalFlow } from '../backend/operations/business_case/application/business-case-operations.mjs';
import { attachDecision, attachVerification, createBusinessCase, transitionBusinessCase } from '../backend/operations/business_case/domain/business-case.mjs';
import { BusinessCaseErrorCode } from '../backend/operations/business_case/domain/business-case-errors.mjs';
import { BusinessCaseState } from '../backend/operations/business_case/domain/business-case-lifecycle.mjs';

const policyReference = 'policy:business-onboarding:v1';
const caseIdentifier = 'case:business:001';
const correlationId = 'correlation:001';
const association = (reference) => ({ reference, caseIdentifier, correlationId, policyReference });
const caseInput = { caseIdentifier, caseType: 'BUSINESS_REGISTRATION', responsibleRole: 'BUSINESS_REGISTRATION_OFFICER', governingPolicyReference: policyReference, correlationId, createdAt: '2026-07-26T09:00:00Z' };

test('unit: creates an immutable, owned and audited business case', () => {
  const value = createBusinessCase(caseInput);
  assert.equal(value.state, BusinessCaseState.CREATED);
  assert.equal(value.version, 1);
  assert.equal(value.timeline[0].type, 'BUSINESS_CASE_CREATED');
  assert.equal(value.auditRecords[0].correlationId, correlationId);
  assert.ok(Object.isFrozen(value));
});

test('unit: rejects invalid data, duplicate IDs, circular references and invalid ownership', () => {
  assert.throws(() => createBusinessCase({ ...caseInput, responsibleRole: '' }), { code: BusinessCaseErrorCode.INVALID_OWNERSHIP });
  assert.throws(() => createBusinessCase(caseInput, { existingCaseIdentifiers: [caseIdentifier] }), { code: BusinessCaseErrorCode.DUPLICATE_CASE_ID });
  assert.throws(() => createBusinessCase({ ...caseInput, relatedCaseIdentifiers: [caseIdentifier] }), { code: BusinessCaseErrorCode.CIRCULAR_REFERENCE });
});

test('unit: permits only CREATED to ACTIVE to COMPLETED to CLOSED lifecycle', () => {
  const created = createBusinessCase(caseInput);
  assert.throws(() => transitionBusinessCase(created, BusinessCaseState.COMPLETED, '2026-07-26T09:01:00Z'), { code: BusinessCaseErrorCode.INVALID_TRANSITION });
  const active = transitionBusinessCase(created, BusinessCaseState.ACTIVE, '2026-07-26T09:01:00Z');
  const completed = transitionBusinessCase(active, BusinessCaseState.COMPLETED, '2026-07-26T09:02:00Z');
  assert.equal(transitionBusinessCase(completed, BusinessCaseState.CLOSED, '2026-07-26T09:03:00Z').state, BusinessCaseState.CLOSED);
});

test('unit: validates ordered references and decision association', () => {
  const active = transitionBusinessCase(createBusinessCase(caseInput), BusinessCaseState.ACTIVE, '2026-07-26T09:01:00Z');
  assert.throws(() => attachVerification(active, association('verification:001'), '2026-07-26T09:02:00Z'), { code: BusinessCaseErrorCode.MISSING_REFERENCE });
  assert.throws(() => attachDecision(active, association('decision:001'), '2026-07-26T09:03:00Z'), { code: BusinessCaseErrorCode.INVALID_DECISION });
});

test('integration and end-to-end: OP-001A to B to C outputs remain linked to one OP-001D case and audit timeline', () => {
  const value = runBusinessCaseOperationalFlow({
    caseInput,
    registration: association('registration:001'),
    verification: association('verification:001'),
    decision: { ...association('decision:001'), verificationReference: 'verification:001' },
    timestamps: {
      activated: '2026-07-26T09:01:00Z', registrationAttached: '2026-07-26T09:02:00Z',
      verificationAttached: '2026-07-26T09:03:00Z', decisionAttached: '2026-07-26T09:04:00Z', completed: '2026-07-26T09:05:00Z',
    },
  });
  assert.deepEqual(value.references, { registration: 'registration:001', verification: 'verification:001', decision: 'decision:001' });
  assert.equal(value.state, BusinessCaseState.COMPLETED);
  assert.deepEqual(value.timeline.map(({ type }) => type), ['BUSINESS_CASE_CREATED', 'BUSINESS_CASE_STATE_CHANGED', 'REGISTRATION_ATTACHED', 'VERIFICATION_ATTACHED', 'DECISION_ATTACHED', 'BUSINESS_CASE_STATE_CHANGED']);
  assert.ok(value.timeline.every((entry) => entry.caseIdentifier === caseIdentifier && entry.correlationId === correlationId));
  assert.equal(value.auditRecords.length, value.timeline.length);
});

