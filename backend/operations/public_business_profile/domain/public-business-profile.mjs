import { PublicBusinessProfileError, PublicBusinessProfileErrorCode } from './public-business-profile-errors.mjs';

export const PublicContactType = Object.freeze({
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  WEBSITE: 'WEBSITE',
});

const publicInformationFields = Object.freeze([
  'businessName', 'businessCategoryReference', 'businessDescription', 'publicContactMethods',
  'businessLocationReference', 'operatingHours', 'verificationBadgeReference', 'publicMetadata',
]);
const forbiddenExposureFields = Object.freeze([
  'decision', 'decisionReference', 'decisionHistory', 'audit', 'auditReference', 'auditRecords', 'auditHistory',
  'policy', 'policyReference', 'internalPolicy', 'internalPolicies', 'operationalStatus', 'operationalRecords',
  'internalOperationalRecords', 'businessCase', 'businessCaseReference', 'businessCaseInternals', 'registration',
  'verification', 'approval', 'publication', 'correlationIdentifier', 'responsibleRole', 'governingPolicyReference',
]);

const requireText = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.INVALID_PUBLIC_EXPOSURE, `${field} is required.`, { field });
  return value.trim();
};

const freezeValue = (value) => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
  return value;
};

function validatePublicInformation(information) {
  if (!information || typeof information !== 'object' || Array.isArray(information)) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.INVALID_PUBLIC_EXPOSURE, 'Public information is required.');
  const unknown = Object.keys(information).filter((field) => !publicInformationFields.includes(field));
  const serializedKeys = [];
  const inspect = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) { serializedKeys.push(key); inspect(item); }
  };
  inspect(information);
  const forbidden = serializedKeys.filter((field) => forbiddenExposureFields.includes(field));
  if (unknown.length || forbidden.length) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.INVALID_PUBLIC_EXPOSURE, 'Public information contains unauthorized fields.', { fields: [...unknown, ...forbidden] });
  requireText(information.businessName, 'businessName');
  requireText(information.businessCategoryReference, 'businessCategoryReference');
  requireText(information.businessDescription, 'businessDescription');
  requireText(information.businessLocationReference, 'businessLocationReference');
  requireText(information.verificationBadgeReference, 'verificationBadgeReference');
  if (!Array.isArray(information.publicContactMethods) || information.publicContactMethods.length === 0 || information.publicContactMethods.some((contact) => !Object.values(PublicContactType).includes(contact?.type) || typeof contact.value !== 'string' || contact.value.trim() === '')) {
    throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.INVALID_PUBLIC_EXPOSURE, 'At least one valid public contact method is required.');
  }
  if (!Array.isArray(information.operatingHours) || information.operatingHours.length === 0 || information.operatingHours.some((entry) => typeof entry?.dayReference !== 'string' || typeof entry?.opensAt !== 'string' || typeof entry?.closesAt !== 'string')) {
    throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.INVALID_PUBLIC_EXPOSURE, 'Valid operating hours are required.');
  }
  if (!information.publicMetadata || typeof information.publicMetadata !== 'object' || Array.isArray(information.publicMetadata)) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.INVALID_PUBLIC_EXPOSURE, 'Public metadata is required.');
}

export function createPublicBusinessProfile(input, { existingProfileIdentifiers = [], profiledBusinessCaseReferences = [] } = {}) {
  const visibility = input?.visibility;
  if (!visibility?.visibilityIdentifier) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.MISSING_VISIBILITY, 'Business Visibility is required.');
  if (visibility.status !== 'VISIBLE') throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.INVALID_VISIBILITY, 'Business Visibility outcome must be VISIBLE.');
  const publication = input?.publication;
  if (!publication?.publicationIdentifier) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.MISSING_PUBLICATION, 'Business Publication is required.');
  if (publication.status !== 'PUBLISHED' || visibility.associations?.publicationReference !== publication.publicationIdentifier) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.UNAUTHORIZED_VISIBILITY, 'Visibility is not authorized for this published record.');
  const businessCase = input?.businessCase;
  if (!businessCase?.caseIdentifier) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.MISSING_BUSINESS_CASE, 'Business Case is required.');
  if (visibility.associations.businessCaseReference !== businessCase.caseIdentifier || publication.associations?.businessCaseReference !== businessCase.caseIdentifier) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.UNAUTHORIZED_VISIBILITY, 'Visibility and Publication must belong to the Business Case.');
  const profileIdentifier = requireText(input?.profileIdentifier, 'profileIdentifier');
  if (existingProfileIdentifiers.includes(profileIdentifier) || profiledBusinessCaseReferences.includes(businessCase.caseIdentifier)) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.DUPLICATE_PROFILE, 'A Public Business Profile already exists for this identifier or Business Case.');
  const governingPolicyReference = input?.governance?.governingPolicyReference;
  if (!input?.governance?.publicExposurePermitted || governingPolicyReference !== businessCase.ownership.governingPolicyReference || governingPolicyReference !== visibility.governance?.governingPolicyReference) throw new PublicBusinessProfileError(PublicBusinessProfileErrorCode.POLICY_VIOLATION, 'Governing policy does not permit public exposure.');
  validatePublicInformation(input.publicInformation);
  const createdAt = requireText(input.createdAt, 'createdAt');
  const auditReference = requireText(input.auditReference, 'auditReference');
  return freezeValue({
    profileIdentifier,
    version: 1,
    publicInformation: input.publicInformation,
    associations: { businessCaseReference: businessCase.caseIdentifier, publicationReference: publication.publicationIdentifier, visibilityReference: visibility.visibilityIdentifier },
    governance: { governingPolicyReference },
    auditAssociation: { auditReference, action: 'PUBLIC_BUSINESS_PROFILE_CREATED', evidenceReference: requireText(input.evidenceReference, 'evidenceReference'), recordedAt: createdAt, correlationIdentifier: businessCase.correlationId },
    createdAt,
  });
}

// This is the only public projection. Governance, audit, case, publication, and
// visibility associations deliberately remain outside the returned representation.
export function projectPublicBusinessProfile(profile) {
  return freezeValue({ profileIdentifier: profile.profileIdentifier, version: profile.version, ...profile.publicInformation });
}
