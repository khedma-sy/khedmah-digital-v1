import { bindCanonicalGovernanceContext, executePolicyResolver, executeRoleResolver } from '../../governance_resolution/application/authoritative-governance-resolvers.mjs';
import { GovernanceAuthority } from '../../governance_resolution/domain/governance-resolution.mjs';
import { authenticateAuthorityEnvelope, AuthoritySource, AuthorityTransportState, receiveAuthorityEnvelope, verifyAuthorityEnvelope } from '../domain/authority-transport.mjs';
import { AuthorityTransportError, AuthorityTransportErrorCode } from '../domain/authority-transport-errors.mjs';

export function executeAuthenticatedAuthorityTransport(input, trustContext, duplicateContext) {
  const received = receiveAuthorityEnvelope(input, duplicateContext);
  const authenticated = authenticateAuthorityEnvelope(received, trustContext.authorityRegistry, input.authenticationEvidence);
  return verifyAuthorityEnvelope(authenticated, trustContext.authorityRegistry, { expectedCorrelationIdentifier: trustContext.expectedCorrelationIdentifier, now: trustContext.now, maxAgeMs: trustContext.maxAgeMs, evidence: input.verificationEvidence });
}

const resolverInput = (envelope, authority) => ({ ...envelope.payload, authority, authorityReference: envelope.authorityIdentifier });

export function resolveTransportedGovernance({ policyEnvelope, roleEnvelope, operationalContext, duplicateContext = {} }) {
  if (policyEnvelope?.state !== AuthorityTransportState.VERIFIED || policyEnvelope.authoritySource !== AuthoritySource.POLICY) throw new AuthorityTransportError(AuthorityTransportErrorCode.INVALID_ENVELOPE, 'Verified Policy authority envelope is required.');
  if (roleEnvelope?.state !== AuthorityTransportState.VERIFIED || roleEnvelope.authoritySource !== AuthoritySource.ROLE) throw new AuthorityTransportError(AuthorityTransportErrorCode.INVALID_ENVELOPE, 'Verified Role authority envelope is required.');
  if (policyEnvelope.correlationIdentifier !== roleEnvelope.correlationIdentifier) throw new AuthorityTransportError(AuthorityTransportErrorCode.INVALID_CORRELATION, 'Policy and Role authority correlations differ.');
  const policyResolution = executePolicyResolver(resolverInput(policyEnvelope, GovernanceAuthority.POLICY), duplicateContext.policy);
  const roleResolution = executeRoleResolver(resolverInput(roleEnvelope, GovernanceAuthority.ROLE), duplicateContext.role);
  return bindCanonicalGovernanceContext({ policyResolution, roleResolution, operationalContext });
}

