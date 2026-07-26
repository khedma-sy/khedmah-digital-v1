import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCanonicalOperationalContext, executeDecisionAdapter, executeRegistrationAdapter, executeVerificationAdapter } from '../backend/operations/canonical_adapters/application/canonical-operational-adapters.mjs';
import { bindCanonicalGovernanceContext, executePolicyResolver, executeRoleResolver } from '../backend/operations/governance_resolution/application/authoritative-governance-resolvers.mjs';
import { CanonicalPermission, GovernanceAuthority, GovernanceResolutionState } from '../backend/operations/governance_resolution/domain/governance-resolution.mjs';
import { GovernanceResolutionErrorCode } from '../backend/operations/governance_resolution/domain/governance-resolution-errors.mjs';
import { executeCompleteOperationalChain } from './support/complete-operational-chain.mjs';

const lineage = { businessRequestReference: 'request:003c', caseIdentifier: 'case:integration:003a', decisionReference: 'decision:integration:003a', operationalStatusReference: 'status:integration:003a', correlationIdentifier: 'correlation:integration:003a' };
const evidence = (name) => ({ creationEvidence: { recordedAt: '2026-07-26T07:00:00Z', auditReference: `audit:${name}:created` }, validationEvidence: { recordedAt: '2026-07-26T07:01:00Z', auditReference: `audit:${name}:validated` }, bindingEvidence: { recordedAt: '2026-07-26T07:02:00Z', auditReference: `audit:${name}:bound` } });
const adapterInput = (adapterIdentifier, outputReference, minute) => ({ adapterIdentifier, outputReference, businessRequestReference: lineage.businessRequestReference, caseIdentifier: lineage.caseIdentifier, correlationIdentifier: lineage.correlationIdentifier, policyReference: 'policy:integration:003a', recordedAt: `2026-07-26T06:0${minute}:00Z`, auditReference: `audit:${adapterIdentifier}:created`, validationEvidence: { recordedAt: `2026-07-26T06:1${minute}:00Z`, auditReference: `audit:${adapterIdentifier}:validated` }, bindingEvidence: { recordedAt: `2026-07-26T06:2${minute}:00Z`, auditReference: `audit:${adapterIdentifier}:bound` } });

function operationalContext() {
  const registrationAdapter = executeRegistrationAdapter(adapterInput('adapter:registration:003c', 'registration:integration:003a', 1));
  const verificationAdapter = executeVerificationAdapter(adapterInput('adapter:verification:003c', 'verification:integration:003a', 2), registrationAdapter);
  const decisionAdapter = executeDecisionAdapter(adapterInput('adapter:decision:003c', lineage.decisionReference, 3), verificationAdapter);
  return buildCanonicalOperationalContext({ registrationAdapter, verificationAdapter, decisionAdapter });
}
const policyInput = (overrides = {}) => ({ resolutionIdentifier: 'resolution:policy:003c', ...lineage, authorityReference: 'policy-authority:primary', output: { policyReference: 'policy:integration:003a', permissions: Object.values(CanonicalPermission) }, ...evidence('policy'), ...overrides });
const roleInput = (overrides = {}) => ({ resolutionIdentifier: 'resolution:role:003c', ...lineage, authorityReference: 'role-authority:primary', output: { responsibleRole: 'INTEGRATION_GOVERNANCE_OFFICER', authorizedRoles: ['INTEGRATION_GOVERNANCE_OFFICER'] }, ...evidence('role'), ...overrides });

test('unit: resolves authoritative Policy and Role with immutable audit lifecycle', () => {
  const policy = executePolicyResolver(policyInput());
  const role = executeRoleResolver(roleInput());
  assert.equal(policy.state, GovernanceResolutionState.BOUND);
  assert.equal(role.state, GovernanceResolutionState.BOUND);
  assert.deepEqual(policy.history.map(({ currentState }) => currentState), ['CREATED', 'VALIDATED', 'BOUND']);
  assert.ok(Object.isFrozen(role.output.authorizedRoles));
});

test('unit: rejects missing/invalid Policy, missing/invalid Role, duplicate bindings and invalid output', () => {
  assert.throws(() => executePolicyResolver(policyInput({ output: {} })), { code: GovernanceResolutionErrorCode.MISSING_POLICY });
  assert.throws(() => executePolicyResolver(policyInput({ authority: 'CALLER_POLICY' })), { code: GovernanceResolutionErrorCode.INVALID_POLICY });
  assert.throws(() => executeRoleResolver(roleInput({ output: {} })), { code: GovernanceResolutionErrorCode.MISSING_ROLE });
  assert.throws(() => executeRoleResolver(roleInput({ authority: 'CALLER_ROLE' })), { code: GovernanceResolutionErrorCode.INVALID_ROLE });
  assert.throws(() => executePolicyResolver(policyInput(), { existingResolutionIdentifiers: ['resolution:policy:003c'] }), { code: GovernanceResolutionErrorCode.DUPLICATE_BINDING });
  assert.throws(() => executePolicyResolver({ ...policyInput(), resolverType: 'UNKNOWN', output: { policyReference: 'policy:integration:003a', permissions: ['UNKNOWN'] } }), { code: GovernanceResolutionErrorCode.INVALID_POLICY });
});

test('integration: canonical adapters bind authoritative governance context with continuous lineage', () => {
  const context = operationalContext();
  const governance = bindCanonicalGovernanceContext({ policyResolution: executePolicyResolver(policyInput()), roleResolution: executeRoleResolver(roleInput()), operationalContext: context });
  assert.equal(governance.policyReference, 'policy:integration:003a');
  assert.equal(governance.responsibleRole, 'INTEGRATION_GOVERNANCE_OFFICER');
  assert.equal(governance.searchPermitted, true);
  assert.equal(governance.policyResolution.authority, GovernanceAuthority.POLICY);
});

test('integration: rejects missing resolver and invalid adapter/governance lineage', () => {
  const context = operationalContext();
  const policyResolution = executePolicyResolver(policyInput());
  assert.throws(() => bindCanonicalGovernanceContext({ policyResolution, operationalContext: context }), { code: GovernanceResolutionErrorCode.MISSING_ROLE });
  const roleResolution = executeRoleResolver(roleInput({ caseIdentifier: 'case:other' }));
  assert.throws(() => bindCanonicalGovernanceContext({ policyResolution, roleResolution, operationalContext: context }), { code: GovernanceResolutionErrorCode.INVALID_LINEAGE });
});

test('end-to-end: authoritative governance drives OP-001D through OP-002F without behavior changes', () => {
  const context = operationalContext();
  const governance = bindCanonicalGovernanceContext({ policyResolution: executePolicyResolver(policyInput()), roleResolution: executeRoleResolver(roleInput()), operationalContext: context });
  const chain = executeCompleteOperationalChain({ operationalContext: context, governanceContext: governance });
  assert.equal(chain.approved.approval.status, 'APPROVED');
  assert.equal(chain.published.publication.status, 'PUBLISHED');
  assert.equal(chain.visible.visibility.status, 'VISIBLE');
  assert.equal(chain.discovered.discovery.status, 'DISCOVERABLE');
  assert.equal(chain.searched.search.status, 'SEARCHABLE');
  assert.equal(chain.searched.results[0].businessName, 'خدمة التكامل');
  assert.equal(chain.approved.approval.authorization.governingPolicyReference, governance.policyReference);
  assert.equal(chain.published.publication.governance.responsibleRole, governance.responsibleRole);
});

