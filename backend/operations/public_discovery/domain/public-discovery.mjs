import { projectPublicBusinessProfile } from '../../public_business_profile/domain/public-business-profile.mjs';
import { PublicDiscoveryError, PublicDiscoveryErrorCode } from './public-discovery-errors.mjs';

export const DiscoveryStatus = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  DISCOVERABLE: 'DISCOVERABLE',
  HIDDEN: 'HIDDEN',
});

const requireText = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') throw new PublicDiscoveryError(PublicDiscoveryErrorCode.INVALID_REQUEST, `${field} is required.`, { field });
  return value.trim();
};

const freezeValue = (value) => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
  return value;
};

const auditRecord = (record, action, input) => Object.freeze({
  auditReference: `audit:${record.discoveryIdentifier}:${record.version + 1}:${action}`,
  action,
  discoveryIdentifier: record.discoveryIdentifier,
  publicProfileReference: record.associations.publicProfileReference,
  visibilityReference: record.associations.visibilityReference,
  publicationReference: record.associations.publicationReference,
  policyReference: record.governance.governingPolicyReference,
  evidenceReference: requireText(input.evidenceReference, 'evidenceReference'),
  recordedAt: requireText(input.recordedAt, 'recordedAt'),
});

export function establishDiscoveryEligibility(input, { existingDiscoveryIdentifiers = [], discoveredProfileReferences = [] } = {}) {
  const profile = input?.publicProfile;
  if (!profile?.profileIdentifier) throw new PublicDiscoveryError(PublicDiscoveryErrorCode.MISSING_PUBLIC_PROFILE, 'Public Business Profile is required.');
  const visibility = input?.visibility;
  if (!visibility?.visibilityIdentifier) throw new PublicDiscoveryError(PublicDiscoveryErrorCode.MISSING_VISIBILITY, 'Business Visibility is required.');
  if (visibility.status !== 'VISIBLE') throw new PublicDiscoveryError(PublicDiscoveryErrorCode.INVALID_VISIBILITY, 'Business Visibility must be VISIBLE.');
  const publication = input?.publication;
  if (!publication?.publicationIdentifier || publication.status !== 'PUBLISHED' || !publication.publicationTimestamp) throw new PublicDiscoveryError(PublicDiscoveryErrorCode.INVALID_PUBLICATION, 'A PUBLISHED Business Publication is required.');
  if (profile.associations?.visibilityReference !== visibility.visibilityIdentifier || profile.associations?.publicationReference !== publication.publicationIdentifier || visibility.associations?.publicationReference !== publication.publicationIdentifier) {
    throw new PublicDiscoveryError(PublicDiscoveryErrorCode.UNAUTHORIZED_EXPOSURE, 'Profile, Visibility, and Publication lineage must match.');
  }
  const discoveryIdentifier = requireText(input?.discoveryIdentifier, 'discoveryIdentifier');
  if (existingDiscoveryIdentifiers.includes(discoveryIdentifier) || discoveredProfileReferences.includes(profile.profileIdentifier)) throw new PublicDiscoveryError(PublicDiscoveryErrorCode.DUPLICATE_DISCOVERY, 'Discovery already exists for this identifier or Public Business Profile.');
  const governingPolicyReference = input?.governance?.governingPolicyReference;
  if (!input?.governance?.discoveryPermitted || governingPolicyReference !== profile.governance?.governingPolicyReference || governingPolicyReference !== visibility.governance?.governingPolicyReference) throw new PublicDiscoveryError(PublicDiscoveryErrorCode.POLICY_VIOLATION, 'Governing policy does not permit discovery.');
  const base = {
    discoveryIdentifier,
    version: 0,
    status: DiscoveryStatus.ELIGIBLE,
    associations: { publicProfileReference: profile.profileIdentifier, visibilityReference: visibility.visibilityIdentifier, publicationReference: publication.publicationIdentifier },
    governance: { governingPolicyReference },
    discoveryProjection: projectPublicBusinessProfile(profile),
    auditRecords: [],
  };
  const audit = auditRecord(base, 'PUBLIC_DISCOVERY_ELIGIBLE', { recordedAt: input.recordedAt, evidenceReference: input.eligibilityEvidenceReference });
  return freezeValue({ ...base, version: 1, auditRecords: [audit] });
}

export function recordDiscoveryOutcome(record, outcome, input) {
  if (![DiscoveryStatus.DISCOVERABLE, DiscoveryStatus.HIDDEN].includes(outcome) || record.status !== DiscoveryStatus.ELIGIBLE) throw new PublicDiscoveryError(PublicDiscoveryErrorCode.INVALID_TRANSITION, `Cannot transition discovery from ${record.status} to ${outcome}.`);
  const audit = auditRecord(record, `PUBLIC_DISCOVERY_${outcome}`, { recordedAt: input.recordedAt, evidenceReference: input.outcomeEvidenceReference });
  return freezeValue({ ...record, version: record.version + 1, status: outcome, outcomeReasonReference: requireText(input.outcomeReasonReference, 'outcomeReasonReference'), auditRecords: [...record.auditRecords, audit] });
}

export function projectDiscoveryListing(record) {
  if (record.status !== DiscoveryStatus.DISCOVERABLE) return null;
  return freezeValue({ discoveryIdentifier: record.discoveryIdentifier, publicProfileReference: record.associations.publicProfileReference, ...record.discoveryProjection });
}

