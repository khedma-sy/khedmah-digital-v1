import { GovernanceResolutionError, GovernanceResolutionErrorCode } from './governance-resolution-errors.mjs';

export const GovernanceResolverType = Object.freeze({ POLICY: 'POLICY_RESOLVER', ROLE: 'ROLE_RESOLVER' });
export const GovernanceAuthority = Object.freeze({ POLICY: 'CANONICAL_POLICY_AUTHORITY', ROLE: 'CANONICAL_ROLE_AUTHORITY' });
export const GovernanceResolutionState = Object.freeze({ CREATED: 'CREATED', VALIDATED: 'VALIDATED', BOUND: 'BOUND' });
export const CanonicalPermission = Object.freeze({ APPROVAL: 'APPROVAL', PUBLICATION: 'PUBLICATION', VISIBILITY: 'VISIBILITY', PUBLIC_EXPOSURE: 'PUBLIC_EXPOSURE', DISCOVERY: 'DISCOVERY', SEARCH: 'SEARCH' });

const requireText = (value, field, code = GovernanceResolutionErrorCode.INVALID_OUTPUT) => {
  if (typeof value !== 'string' || value.trim() === '') throw new GovernanceResolutionError(code, `${field} is required.`, { field });
  return value.trim();
};
const freezeValue = (value) => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
  return value;
};
const historyEntry = (resolution, state, evidence) => freezeValue({ sequence: resolution.version + 1, previousState: resolution.state ?? null, currentState: state, resolutionIdentifier: resolution.resolutionIdentifier, resolverType: resolution.resolverType, businessRequestReference: resolution.businessRequestReference, correlationIdentifier: resolution.correlationIdentifier, recordedAt: requireText(evidence?.recordedAt, 'recordedAt'), auditReference: requireText(evidence?.auditReference, 'auditReference') });

export function createGovernanceResolution(input, { existingResolutionIdentifiers = [], existingBindings = [] } = {}) {
  const resolutionIdentifier = requireText(input?.resolutionIdentifier, 'resolutionIdentifier');
  if (!Object.values(GovernanceResolverType).includes(input?.resolverType)) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.INVALID_OUTPUT, 'Resolver type is invalid.');
  const bindingKey = `${input.resolverType}:${input.businessRequestReference}:${input.caseIdentifier}`;
  if (existingResolutionIdentifiers.includes(resolutionIdentifier) || existingBindings.includes(bindingKey)) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.DUPLICATE_BINDING, 'Governance resolution identifier or request binding already exists.');
  const base = { resolutionIdentifier, resolverType: input.resolverType, authority: input.authority, authorityReference: requireText(input?.authorityReference, 'authorityReference'), version: 0, state: null, businessRequestReference: requireText(input?.businessRequestReference, 'businessRequestReference'), caseIdentifier: requireText(input?.caseIdentifier, 'caseIdentifier'), decisionReference: requireText(input?.decisionReference, 'decisionReference'), operationalStatusReference: requireText(input?.operationalStatusReference, 'operationalStatusReference'), correlationIdentifier: requireText(input?.correlationIdentifier, 'correlationIdentifier'), output: input.output, bindingKey, history: [] };
  const created = historyEntry(base, GovernanceResolutionState.CREATED, input.creationEvidence);
  return freezeValue({ ...base, version: 1, state: GovernanceResolutionState.CREATED, history: [created] });
}

export function validateGovernanceResolution(resolution, evidence) {
  if (resolution.state !== GovernanceResolutionState.CREATED) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.INVALID_LIFECYCLE, 'Only a CREATED governance resolution can be validated.');
  if (resolution.resolverType === GovernanceResolverType.POLICY) {
    if (resolution.authority !== GovernanceAuthority.POLICY) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.INVALID_POLICY, 'Policy resolution source is not authoritative.');
    if (!resolution.output?.policyReference) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.MISSING_POLICY, 'Authoritative policy is missing.');
    if (!Array.isArray(resolution.output.permissions) || resolution.output.permissions.some((permission) => !Object.values(CanonicalPermission).includes(permission))) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.INVALID_POLICY, 'Policy permissions are invalid.');
  } else {
    if (resolution.authority !== GovernanceAuthority.ROLE) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.INVALID_ROLE, 'Role resolution source is not authoritative.');
    if (!resolution.output?.responsibleRole || !Array.isArray(resolution.output.authorizedRoles) || !resolution.output.authorizedRoles.includes(resolution.output.responsibleRole)) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.MISSING_ROLE, 'Authoritative responsible role is missing or unauthorized.');
  }
  const validated = historyEntry(resolution, GovernanceResolutionState.VALIDATED, evidence);
  return freezeValue({ ...resolution, version: resolution.version + 1, state: GovernanceResolutionState.VALIDATED, history: [...resolution.history, validated] });
}

export function bindGovernanceResolution(resolution, evidence) {
  if (resolution.state !== GovernanceResolutionState.VALIDATED) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.INVALID_LIFECYCLE, 'Only a VALIDATED governance resolution can be bound.');
  const bound = historyEntry(resolution, GovernanceResolutionState.BOUND, evidence);
  return freezeValue({ ...resolution, version: resolution.version + 1, state: GovernanceResolutionState.BOUND, history: [...resolution.history, bound] });
}

