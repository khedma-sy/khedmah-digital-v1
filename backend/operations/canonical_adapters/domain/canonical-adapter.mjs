import { CanonicalAdapterError, CanonicalAdapterErrorCode } from './canonical-adapter-errors.mjs';

export const CanonicalAdapterType = Object.freeze({ REGISTRATION: 'OP-001A', VERIFICATION: 'OP-001B', DECISION: 'OP-001C' });
export const CanonicalAdapterState = Object.freeze({ CREATED: 'CREATED', VALIDATED: 'VALIDATED', BOUND: 'BOUND' });

const requireText = (value, field, code = CanonicalAdapterErrorCode.INVALID_ADAPTER) => {
  if (typeof value !== 'string' || value.trim() === '') throw new CanonicalAdapterError(code, `${field} is required.`, { field });
  return value.trim();
};
const freezeValue = (value) => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
  return value;
};
const event = (adapter, state, at, auditReference) => freezeValue({ sequence: adapter.version + 1, previousState: adapter.state ?? null, currentState: state, recordedAt: requireText(at, 'recordedAt'), auditReference: requireText(auditReference, 'auditReference'), adapterIdentifier: adapter.adapterIdentifier, businessRequestReference: adapter.businessRequestReference, correlationIdentifier: adapter.correlationIdentifier });

export function createCanonicalAdapter(input, { existingAdapterIdentifiers = [], existingBindings = [] } = {}) {
  const adapterIdentifier = requireText(input?.adapterIdentifier, 'adapterIdentifier');
  const adapterType = input?.adapterType;
  if (!Object.values(CanonicalAdapterType).includes(adapterType)) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.INVALID_ADAPTER, 'Adapter type is not canonical.');
  const outputReference = requireText(input?.outputReference, 'outputReference');
  if (existingAdapterIdentifiers.includes(adapterIdentifier) || existingBindings.some((binding) => binding.adapterType === adapterType && binding.outputReference === outputReference)) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.DUPLICATE_ADAPTER, 'Adapter identifier or canonical binding already exists.');
  const base = { adapterIdentifier, adapterType, version: 0, state: null, businessRequestReference: requireText(input?.businessRequestReference, 'businessRequestReference'), caseIdentifier: requireText(input?.caseIdentifier, 'caseIdentifier'), correlationIdentifier: requireText(input?.correlationIdentifier, 'correlationIdentifier'), policyReference: requireText(input?.policyReference, 'policyReference'), outputReference, predecessorAdapterReference: input.predecessorAdapterReference ?? null, history: [] };
  const created = event(base, CanonicalAdapterState.CREATED, input.recordedAt, input.auditReference);
  return freezeValue({ ...base, version: 1, state: CanonicalAdapterState.CREATED, history: [created] });
}

export function validateCanonicalAdapter(adapter, predecessor, evidence) {
  if (adapter.state !== CanonicalAdapterState.CREATED) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.INVALID_LIFECYCLE, 'Only a CREATED adapter can be validated.');
  if (adapter.adapterType === CanonicalAdapterType.REGISTRATION) {
    if (adapter.predecessorAdapterReference !== null || predecessor !== undefined) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.INVALID_LINKAGE, 'Registration adapter cannot have an operational predecessor.');
  } else {
    if (!predecessor) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.MISSING_ADAPTER, 'Predecessor adapter is required.');
    const expectedType = adapter.adapterType === CanonicalAdapterType.VERIFICATION ? CanonicalAdapterType.REGISTRATION : CanonicalAdapterType.VERIFICATION;
    if (predecessor.adapterType !== expectedType || predecessor.state !== CanonicalAdapterState.BOUND || adapter.predecessorAdapterReference !== predecessor.adapterIdentifier || ['businessRequestReference', 'caseIdentifier', 'correlationIdentifier', 'policyReference'].some((field) => adapter[field] !== predecessor[field])) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.INVALID_LINKAGE, 'Adapter predecessor and canonical lineage do not match.');
  }
  const validated = event(adapter, CanonicalAdapterState.VALIDATED, evidence.recordedAt, evidence.auditReference);
  return freezeValue({ ...adapter, version: adapter.version + 1, state: CanonicalAdapterState.VALIDATED, history: [...adapter.history, validated] });
}

export function bindCanonicalAdapter(adapter, evidence) {
  if (adapter.state !== CanonicalAdapterState.VALIDATED) throw new CanonicalAdapterError(CanonicalAdapterErrorCode.INVALID_LIFECYCLE, 'Only a VALIDATED adapter can be bound.');
  const bound = event(adapter, CanonicalAdapterState.BOUND, evidence.recordedAt, evidence.auditReference);
  return freezeValue({ ...adapter, version: adapter.version + 1, state: CanonicalAdapterState.BOUND, history: [...adapter.history, bound] });
}

