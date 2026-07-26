import { bindCanonicalAdapter, CanonicalAdapterState, CanonicalAdapterType, createCanonicalAdapter, validateCanonicalAdapter } from '../domain/canonical-adapter.mjs';
import { CanonicalAdapterError, CanonicalAdapterErrorCode } from '../domain/canonical-adapter-errors.mjs';

const execute = (input, predecessor, duplicateContext) => {
  const created = createCanonicalAdapter(input, duplicateContext);
  const validated = validateCanonicalAdapter(created, predecessor, input.validationEvidence);
  return bindCanonicalAdapter(validated, input.bindingEvidence);
};

export const executeRegistrationAdapter = (input, duplicateContext) => execute({ ...input, adapterType: CanonicalAdapterType.REGISTRATION, predecessorAdapterReference: null }, undefined, duplicateContext);
export const executeVerificationAdapter = (input, registrationAdapter, duplicateContext) => execute({ ...input, adapterType: CanonicalAdapterType.VERIFICATION, predecessorAdapterReference: registrationAdapter?.adapterIdentifier }, registrationAdapter, duplicateContext);
export const executeDecisionAdapter = (input, verificationAdapter, duplicateContext) => execute({ ...input, adapterType: CanonicalAdapterType.DECISION, predecessorAdapterReference: verificationAdapter?.adapterIdentifier }, verificationAdapter, duplicateContext);

export function buildCanonicalOperationalContext({ registrationAdapter, verificationAdapter, decisionAdapter }) {
  if (!registrationAdapter || !verificationAdapter || !decisionAdapter) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.MISSING_ADAPTER, 'Registration, Verification, and Decision adapters are required.');
  if (![registrationAdapter, verificationAdapter, decisionAdapter].every((adapter) => adapter.state === CanonicalAdapterState.BOUND)) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.INCOMPATIBLE_CAPABILITY, 'Every adapter must be BOUND before capability integration.');
  if (verificationAdapter.predecessorAdapterReference !== registrationAdapter.adapterIdentifier || decisionAdapter.predecessorAdapterReference !== verificationAdapter.adapterIdentifier) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.INVALID_LINKAGE, 'Canonical adapter chain is incomplete.');
  const fields = ['businessRequestReference', 'caseIdentifier', 'correlationIdentifier', 'policyReference'];
  if (fields.some((field) => registrationAdapter[field] !== verificationAdapter[field] || registrationAdapter[field] !== decisionAdapter[field])) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.INVALID_LINKAGE, 'Canonical adapter lineage is inconsistent.');
  const association = (adapter) => Object.freeze({ reference: adapter.outputReference, caseIdentifier: adapter.caseIdentifier, correlationId: adapter.correlationIdentifier, policyReference: adapter.policyReference });
  return Object.freeze({
    businessRequestReference: registrationAdapter.businessRequestReference,
    registration: association(registrationAdapter),
    verification: association(verificationAdapter),
    verificationEvidence: Object.freeze({ reference: verificationAdapter.outputReference, status: 'COMPLETED' }),
    decision: Object.freeze({ ...association(decisionAdapter), verificationReference: verificationAdapter.outputReference }),
    adapters: Object.freeze([registrationAdapter, verificationAdapter, decisionAdapter]),
  });
}

