import { ProfileStatus, ProfileVisibility } from '../../profiles/domain/profile-types.mjs';

export const RelationshipConcept = Object.freeze({
  RELATIONSHIP_RECORD: 'Relationship Record',
  RELATIONSHIP_TYPE: 'Relationship Type',
  RELATIONSHIP_STATUS: 'Relationship Status',
  RELATIONSHIP_SUBJECT: 'Relationship Subject',
  RELATIONSHIP_TARGET: 'Relationship Target',
  RELATIONSHIP_SCOPE: 'Relationship Scope',
  OWNERSHIP_REFERENCE: 'Ownership Reference',
});

export const RelationshipEntityReferenceType = Object.freeze({
  USER_ACCOUNT: 'user_account',
  PROFILE: 'profile',
  PROFESSIONAL_PROFILE: 'professional_profile',
  BUSINESS_PROFILE: 'business_profile',
  ORGANIZATION: 'organization',
  PARTNER: 'partner',
  REPRESENTATIVE: 'representative',
  SERVICE_PROVIDER_REFERENCE: 'service_provider_reference',
});

export const RelationshipType = Object.freeze({
  USER_PROFILE: 'USER_PROFILE',
  BUSINESS_OWNER: 'BUSINESS_OWNER',
  PROFESSIONAL_OWNER: 'PROFESSIONAL_OWNER',
  ORGANIZATION_MEMBER: 'ORGANIZATION_MEMBER',
  PARTNER_RELATIONSHIP: 'PARTNER_RELATIONSHIP',
  REPRESENTATIVE_RELATIONSHIP: 'REPRESENTATIVE_RELATIONSHIP',
  SERVICE_PROVIDER_REFERENCE: 'SERVICE_PROVIDER_REFERENCE',
});

export const RelationshipScope = Object.freeze({
  IDENTITY_REFERENCE: 'identity_reference',
  OWNERSHIP_REFERENCE: 'ownership_reference',
  MEMBERSHIP_REFERENCE: 'membership_reference',
  PARTNER_REFERENCE: 'partner_reference',
  REPRESENTATIVE_REFERENCE: 'representative_reference',
  SERVICE_PROVIDER_REFERENCE: 'service_provider_reference',
});

export const RelationshipVisibility = Object.freeze({
  PUBLIC: ProfileVisibility.PUBLIC,
  PRIVATE: ProfileVisibility.PRIVATE,
  INTERNAL: ProfileVisibility.INTERNAL,
});

export const RelationshipStatus = Object.freeze({
  CREATED: ProfileStatus.CREATED,
  PENDING: ProfileStatus.PENDING,
  ACTIVE: ProfileStatus.ACTIVE,
  SUSPENDED: ProfileStatus.SUSPENDED,
  ARCHIVED: ProfileStatus.ARCHIVED,
});

export const REQUIRED_RELATIONSHIP_FIELDS = Object.freeze(['relationshipRecordRef', 'relationshipType', 'relationshipStatus', 'subjectRef', 'subjectType', 'targetRef', 'targetType', 'relationshipScope', 'visibility', 'ownershipRef']);
export const RELATIONSHIP_RECORD_REFERENCE_PATTERN = /^relationship_record:[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const RELATIONSHIP_ENTITY_REFERENCE_PATTERN = /^(user_account|profile|professional_profile|business_profile|organization|partner|representative|service_provider_reference):[a-z0-9][a-z0-9._:-]{2,127}$/i;
export const OWNERSHIP_REFERENCE_PATTERN = /^ownership_reference:[a-z0-9][a-z0-9._:-]{2,127}$/i;
