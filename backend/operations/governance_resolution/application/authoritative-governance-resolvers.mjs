import { bindGovernanceResolution, CanonicalPermission, GovernanceAuthority, GovernanceResolutionState, GovernanceResolverType, createGovernanceResolution, validateGovernanceResolution } from '../domain/governance-resolution.mjs';
import { GovernanceResolutionError, GovernanceResolutionErrorCode } from '../domain/governance-resolution-errors.mjs';

const execute = (input, duplicateContext) => bindGovernanceResolution(validateGovernanceResolution(createGovernanceResolution(input, duplicateContext), input.validationEvidence), input.bindingEvidence);
export const executePolicyResolver = (input, duplicateContext) => execute({ ...input, resolverType: GovernanceResolverType.POLICY, authority: input.authority ?? GovernanceAuthority.POLICY }, duplicateContext);
export const executeRoleResolver = (input, duplicateContext) => execute({ ...input, resolverType: GovernanceResolverType.ROLE, authority: input.authority ?? GovernanceAuthority.ROLE }, duplicateContext);

export function bindCanonicalGovernanceContext({ policyResolution, roleResolution, operationalContext }) {
  if (!policyResolution) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.MISSING_POLICY, 'Policy resolution is required.');
  if (!roleResolution) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.MISSING_ROLE, 'Role resolution is required.');
  if (![policyResolution, roleResolution].every((resolution) => resolution.state === GovernanceResolutionState.BOUND)) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.INVALID_OUTPUT, 'Governance resolutions must be BOUND.');
  if (!operationalContext?.adapters?.length) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.INVALID_LINEAGE, 'Canonical operational adapter context is required.');
  const registrationAdapter = operationalContext.adapters[0];
  const fields = ['businessRequestReference', 'caseIdentifier', 'decisionReference', 'operationalStatusReference', 'correlationIdentifier'];
  if (fields.some((field) => policyResolution[field] !== roleResolution[field]) || policyResolution.businessRequestReference !== operationalContext.businessRequestReference || policyResolution.caseIdentifier !== registrationAdapter.caseIdentifier || policyResolution.decisionReference !== operationalContext.decision.reference || policyResolution.correlationIdentifier !== registrationAdapter.correlationIdentifier || policyResolution.output.policyReference !== registrationAdapter.policyReference) throw new GovernanceResolutionError(GovernanceResolutionErrorCode.INVALID_LINEAGE, 'Governance resolution and operational adapter lineage are inconsistent.');
  const has = (permission) => policyResolution.output.permissions.includes(permission);
  return Object.freeze({
    policyReference: policyResolution.output.policyReference,
    responsibleRole: roleResolution.output.responsibleRole,
    authorizedRoles: roleResolution.output.authorizedRoles,
    approvalPermitted: has(CanonicalPermission.APPROVAL), publicationPermitted: has(CanonicalPermission.PUBLICATION), visibilityPermitted: has(CanonicalPermission.VISIBILITY), publicExposurePermitted: has(CanonicalPermission.PUBLIC_EXPOSURE), discoveryPermitted: has(CanonicalPermission.DISCOVERY), searchPermitted: has(CanonicalPermission.SEARCH),
    policyResolution, roleResolution,
  });
}

