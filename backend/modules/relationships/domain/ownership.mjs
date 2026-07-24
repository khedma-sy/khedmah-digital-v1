export const RelationshipOwnershipBoundary = Object.freeze({
  USER_ACCOUNT_OWNS_IDENTITY: 'user_account_owns_identity',
  PROFILE_REPRESENTS_PUBLIC_IDENTITY: 'profile_represents_public_identity',
  BUSINESS_PROFILE_OWNS_BUSINESS_IDENTITY: 'business_profile_owns_business_identity',
  PROFESSIONAL_PROFILE_OWNS_PROFESSIONAL_IDENTITY: 'professional_profile_owns_professional_identity',
  ORGANIZATION_OWNS_ORGANIZATIONAL_STRUCTURE: 'organization_owns_organizational_structure',
  RELATIONSHIP_CONNECTS_REFERENCES_ONLY: 'relationship_connects_references_only',
});

export const ForbiddenRelationshipOwnershipRule = Object.freeze({
  RELATIONSHIP_OWNS_ENTITY: 'relationship_owns_entity',
  RELATIONSHIP_REPLACES_OWNERSHIP: 'relationship_replaces_ownership',
  MARKETPLACE_OWNERSHIP: 'marketplace_ownership',
  DUPLICATE_OWNERSHIP_REFERENCE: 'duplicate_ownership_reference',
  SELF_OWNERSHIP_CONFLICT: 'self_ownership_conflict',
  CIRCULAR_OWNERSHIP: 'circular_ownership',
  UNAUTHORIZED_OWNERSHIP_TRANSFER: 'unauthorized_ownership_transfer',
});

export function validateRelationshipOwnershipBoundary(value = {}) {
  const errors = [];
  if (value.relationshipOwnsEntity === true || value.relationshipOwnerRef) errors.push({ field: 'ownershipRef', code: 'RELATIONSHIP_OWNERSHIP_INVALID', message: 'Relationship records only connect references and cannot own entities.' });
  if (value.replacesOwnership === true) errors.push({ field: 'ownershipRef', code: 'RELATIONSHIP_OWNERSHIP_INVALID', message: 'Relationship records cannot replace canonical ownership.' });
  if (value.marketplaceOwnerRef || value.sellerOwnerRef) errors.push({ field: 'ownershipRef', code: 'RELATIONSHIP_OWNERSHIP_INVALID', message: 'Relationship records cannot create marketplace or seller ownership.' });
  if (value.duplicateOwnershipReference === true) errors.push({ field: 'ownershipRef', code: 'RELATIONSHIP_DUPLICATE', message: 'Duplicate ownership references are forbidden.' });
  if (value.subjectRef && value.targetRef && value.subjectRef === value.targetRef) errors.push({ field: 'targetRef', code: 'RELATIONSHIP_OWNERSHIP_INVALID', message: 'Self ownership conflicts are forbidden.' });
  if (value.circularOwnership === true) errors.push({ field: 'ownershipRef', code: 'RELATIONSHIP_OWNERSHIP_INVALID', message: 'Circular ownership is forbidden.' });
  if (value.transferRequested === true && value.transferAuthorized !== true) errors.push({ field: 'ownershipRef.transferAuthorized', code: 'RELATIONSHIP_OWNERSHIP_INVALID', message: 'Unauthorized ownership transfer is forbidden.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
