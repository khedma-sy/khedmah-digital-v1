import { projectPublicBusinessProfile } from '../../public_business_profile/domain/public-business-profile.mjs';
import { BusinessSearchError, BusinessSearchErrorCode } from './business-search-errors.mjs';

export const BusinessSearchStatus = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  SEARCHABLE: 'SEARCHABLE',
  HIDDEN: 'HIDDEN',
});

const requireText = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') throw new BusinessSearchError(BusinessSearchErrorCode.INVALID_REQUEST, `${field} is required.`, { field });
  return value.trim();
};

const freezeValue = (value) => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
  return value;
};

const auditRecord = (record, action, input) => Object.freeze({
  auditReference: `audit:${record.searchIdentifier}:${record.version + 1}:${action}`,
  action,
  searchIdentifier: record.searchIdentifier,
  discoveryReference: record.associations.discoveryReference,
  publicProfileReference: record.associations.publicProfileReference,
  policyReference: record.governance.governingPolicyReference,
  evidenceReference: requireText(input.evidenceReference, 'evidenceReference'),
  recordedAt: requireText(input.recordedAt, 'recordedAt'),
});

export function createBusinessSearchQuery(input) {
  const term = requireText(input?.term, 'term');
  if (term.length > 160) throw new BusinessSearchError(BusinessSearchErrorCode.INVALID_REQUEST, 'Search term exceeds 160 characters.');
  return freezeValue({ queryIdentifier: requireText(input?.queryIdentifier, 'queryIdentifier'), term, normalizedTerm: term.toLocaleLowerCase('ar'), requestedAt: requireText(input?.requestedAt, 'requestedAt') });
}

export function establishBusinessSearchEligibility(input, { existingSearchIdentifiers = [], searchedProfileReferences = [] } = {}) {
  const discovery = input?.discovery;
  if (!discovery?.discoveryIdentifier) throw new BusinessSearchError(BusinessSearchErrorCode.MISSING_DISCOVERY, 'Public Discovery is required.');
  if (discovery.status !== 'DISCOVERABLE') throw new BusinessSearchError(BusinessSearchErrorCode.UNAUTHORIZED_SEARCH, 'Discovery outcome must be DISCOVERABLE.');
  const profile = input?.publicProfile;
  if (!profile?.profileIdentifier) throw new BusinessSearchError(BusinessSearchErrorCode.MISSING_PUBLIC_PROFILE, 'Public Business Profile is required.');
  const visibility = input?.visibility;
  if (visibility?.status !== 'VISIBLE') throw new BusinessSearchError(BusinessSearchErrorCode.INVALID_VISIBILITY, 'Business Visibility must be VISIBLE.');
  const publication = input?.publication;
  if (publication?.status !== 'PUBLISHED' || !publication.publicationTimestamp) throw new BusinessSearchError(BusinessSearchErrorCode.INVALID_PUBLICATION, 'Business Publication must be PUBLISHED.');
  if (discovery.associations?.publicProfileReference !== profile.profileIdentifier || discovery.associations?.visibilityReference !== visibility.visibilityIdentifier || discovery.associations?.publicationReference !== publication.publicationIdentifier || profile.associations?.visibilityReference !== visibility.visibilityIdentifier || profile.associations?.publicationReference !== publication.publicationIdentifier) {
    throw new BusinessSearchError(BusinessSearchErrorCode.UNAUTHORIZED_SEARCH, 'Discovery, Profile, Visibility, and Publication lineage must match.');
  }
  const searchIdentifier = requireText(input?.searchIdentifier, 'searchIdentifier');
  if (existingSearchIdentifiers.includes(searchIdentifier) || searchedProfileReferences.includes(profile.profileIdentifier)) throw new BusinessSearchError(BusinessSearchErrorCode.DUPLICATE_SEARCH, 'Search record already exists for this identifier or Public Business Profile.');
  const governingPolicyReference = input?.governance?.governingPolicyReference;
  if (!input?.governance?.searchPermitted || governingPolicyReference !== discovery.governance?.governingPolicyReference || governingPolicyReference !== profile.governance?.governingPolicyReference) throw new BusinessSearchError(BusinessSearchErrorCode.POLICY_VIOLATION, 'Governing policy does not permit Search.');
  const base = { searchIdentifier, version: 0, status: BusinessSearchStatus.ELIGIBLE, associations: { discoveryReference: discovery.discoveryIdentifier, publicProfileReference: profile.profileIdentifier }, governance: { governingPolicyReference }, resultProjection: projectPublicBusinessProfile(profile), auditRecords: [] };
  const audit = auditRecord(base, 'BUSINESS_SEARCH_ELIGIBLE', { recordedAt: input.recordedAt, evidenceReference: input.eligibilityEvidenceReference });
  return freezeValue({ ...base, version: 1, auditRecords: [audit] });
}

export function recordBusinessSearchOutcome(record, outcome, input) {
  if (![BusinessSearchStatus.SEARCHABLE, BusinessSearchStatus.HIDDEN].includes(outcome) || record.status !== BusinessSearchStatus.ELIGIBLE) throw new BusinessSearchError(BusinessSearchErrorCode.INVALID_TRANSITION, `Cannot transition Search from ${record.status} to ${outcome}.`);
  const audit = auditRecord(record, `BUSINESS_SEARCH_${outcome}`, { recordedAt: input.recordedAt, evidenceReference: input.outcomeEvidenceReference });
  return freezeValue({ ...record, version: record.version + 1, status: outcome, outcomeReasonReference: requireText(input.outcomeReasonReference, 'outcomeReasonReference'), auditRecords: [...record.auditRecords, audit] });
}

export function matchesBusinessSearchQuery(record, query) {
  if (record.status !== BusinessSearchStatus.SEARCHABLE) return false;
  const searchableText = [record.resultProjection.businessName, record.resultProjection.businessCategoryReference, record.resultProjection.businessDescription, record.resultProjection.businessLocationReference].filter(Boolean).join(' ').toLocaleLowerCase('ar');
  return searchableText.includes(query.normalizedTerm);
}

export function projectBusinessSearchResult(record) {
  if (record.status !== BusinessSearchStatus.SEARCHABLE) return null;
  return record.resultProjection;
}

