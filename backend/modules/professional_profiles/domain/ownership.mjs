export const ProfessionalOwnershipBoundary = Object.freeze({
  USER_ACCOUNT_OWNS_IDENTITY_RELATIONSHIP: 'user_account_owns_identity_relationship',
  PROFILE_REPRESENTS_PUBLIC_IDENTITY_LAYER: 'profile_represents_public_identity_layer',
  PROFESSIONAL_PROFILE_REPRESENTS_PROFESSIONAL_IDENTITY: 'professional_profile_represents_professional_identity',
  BUSINESS_PROFILE_OWNS_BUSINESS_ACTIVITY: 'business_profile_owns_business_activity',
  ORGANIZATION_OWNS_ORGANIZATIONAL_RELATIONSHIPS: 'organization_owns_organizational_relationships',
});

export const ForbiddenProfessionalOwnershipRule = Object.freeze({
  PROFESSIONAL_PROFILE_AS_BUSINESS_ENTITY: 'professional_profile_as_business_entity',
  PROFESSIONAL_PROFILE_OWNS_ORGANIZATION: 'professional_profile_owns_organization',
  UNAUTHORIZED_OWNERSHIP_TRANSFER: 'unauthorized_ownership_transfer',
  DUPLICATE_PROFESSIONAL_IDENTITY: 'duplicate_professional_identity',
});

export function validateProfessionalOwnershipReference(ownershipRef = {}) {
  const errors = [];
  if (ownershipRef.ownerModule !== 'users') errors.push({ field: 'ownershipRef.ownerModule', code: 'PROFESSIONAL_OWNERSHIP_INVALID', message: 'Professional profile ownership reference must point to the users module only.' });
  if (typeof ownershipRef.userAccountRef !== 'string' || ownershipRef.userAccountRef.length === 0) errors.push({ field: 'ownershipRef.userAccountRef', code: 'PROFESSIONAL_OWNERSHIP_INVALID', message: 'Professional profile ownership requires a user account reference.' });
  if (typeof ownershipRef.profileRef !== 'string' || ownershipRef.profileRef.length === 0) errors.push({ field: 'ownershipRef.profileRef', code: 'PROFESSIONAL_OWNERSHIP_INVALID', message: 'Professional profile ownership requires a base profile reference.' });
  if (ownershipRef.businessEntityRef || ownershipRef.organizationEntityRef || ownershipRef.serviceRef) errors.push({ field: 'ownershipRef', code: 'PROFESSIONAL_OWNERSHIP_INVALID', message: 'Professional profile foundation must not own business entities, organizations, or services.' });
  if (ownershipRef.duplicateProfessionalIdentity === true) errors.push({ field: 'ownershipRef.duplicateProfessionalIdentity', code: 'PROFESSIONAL_OWNERSHIP_INVALID', message: 'Duplicate professional identity is forbidden.' });
  if (ownershipRef.transferRequested === true && ownershipRef.transferAuthorized !== true) errors.push({ field: 'ownershipRef.transferAuthorized', code: 'PROFESSIONAL_OWNERSHIP_INVALID', message: 'Unauthorized professional ownership transfer is forbidden.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
