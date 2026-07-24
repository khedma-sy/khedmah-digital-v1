export const ProfileOwnershipBoundary = Object.freeze({
  USER_ACCOUNT_OWNS_IDENTITY_RELATIONSHIP: 'user_account_owns_identity_relationship',
  PROFILE_REPRESENTS_PUBLIC_FACING_IDENTITY_LAYER: 'profile_represents_public_facing_identity_layer',
  BUSINESS_OWNERSHIP_BELONGS_TO_BUSINESS_PROFILE_MODULE: 'business_ownership_belongs_to_business_profile_module',
  PROFESSIONAL_OWNERSHIP_BELONGS_TO_PROFESSIONAL_PROFILE_MODULE: 'professional_ownership_belongs_to_professional_profile_module',
  ORGANIZATION_OWNERSHIP_BELONGS_TO_ORGANIZATION_MODULE: 'organization_ownership_belongs_to_organization_module',
});

export const ForbiddenProfileOwnershipRule = Object.freeze({
  DUPLICATE_OWNERSHIP: 'duplicate_ownership',
  PROFILE_AS_BUSINESS_ENTITY: 'profile_as_business_entity',
  PROFILE_AS_ORGANIZATION_ENTITY: 'profile_as_organization_entity',
  UNAUTHORIZED_OWNERSHIP_TRANSFER: 'unauthorized_ownership_transfer',
});

export function validateProfileOwnershipReference(ownershipRef = {}) {
  const errors = [];
  if (ownershipRef.ownerModule !== 'users') errors.push({ field: 'ownershipRef.ownerModule', code: 'PROFILE_OWNERSHIP_INVALID', message: 'Profile ownership reference must point to the users module only.' });
  if (typeof ownershipRef.userAccountRef !== 'string' || ownershipRef.userAccountRef.length === 0) errors.push({ field: 'ownershipRef.userAccountRef', code: 'PROFILE_OWNERSHIP_INVALID', message: 'Profile ownership reference requires a user account reference.' });
  if (ownershipRef.businessEntityRef || ownershipRef.organizationEntityRef || ownershipRef.professionalCredentialRef) errors.push({ field: 'ownershipRef', code: 'PROFILE_OWNERSHIP_INVALID', message: 'Profile foundation must not own business, organization, or professional entities.' });
  if (ownershipRef.transferRequested === true && ownershipRef.transferAuthorized !== true) errors.push({ field: 'ownershipRef.transferAuthorized', code: 'PROFILE_OWNERSHIP_INVALID', message: 'Unauthorized ownership transfer is forbidden.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
