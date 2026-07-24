export const OrganizationOwnershipBoundary = Object.freeze({
  USER_ACCOUNT_OWNS_IDENTITY_RELATIONSHIP: 'user_account_owns_identity_relationship',
  PROFILE_REPRESENTS_PUBLIC_IDENTITY: 'profile_represents_public_identity',
  BUSINESS_PROFILE_REPRESENTS_BUSINESS_IDENTITY: 'business_profile_represents_business_identity',
  ORGANIZATION_REPRESENTS_ORGANIZATIONAL_STRUCTURE: 'organization_represents_organizational_structure',
});

export const ForbiddenOrganizationOwnershipRule = Object.freeze({
  ORGANIZATION_AS_USER_ACCOUNT: 'organization_as_user_account',
  ORGANIZATION_AS_MARKETPLACE_SELLER: 'organization_as_marketplace_seller',
  DUPLICATE_OWNERSHIP: 'duplicate_ownership',
  UNAUTHORIZED_OWNERSHIP_TRANSFER: 'unauthorized_ownership_transfer',
  ORGANIZATION_OWNS_PAYMENT_SYSTEMS: 'organization_owns_payment_systems',
});

export function validateOrganizationOwnershipReference(ownershipRef = {}) {
  const errors = [];
  if (ownershipRef.ownerModule !== 'users') errors.push({ field: 'ownershipRef.ownerModule', code: 'ORGANIZATION_OWNERSHIP_INVALID', message: 'Organization ownership reference must point to the users module only.' });
  if (typeof ownershipRef.userAccountRef !== 'string' || ownershipRef.userAccountRef.length === 0) errors.push({ field: 'ownershipRef.userAccountRef', code: 'ORGANIZATION_OWNERSHIP_INVALID', message: 'Organization ownership requires a user account reference.' });
  if (typeof ownershipRef.profileRef !== 'string' || ownershipRef.profileRef.length === 0) errors.push({ field: 'ownershipRef.profileRef', code: 'ORGANIZATION_OWNERSHIP_INVALID', message: 'Organization ownership requires a base profile reference.' });
  if (ownershipRef.userAccountEntityRef || ownershipRef.marketplaceSellerRef || ownershipRef.paymentSystemRef || ownershipRef.paymentAccountRef) errors.push({ field: 'ownershipRef', code: 'ORGANIZATION_OWNERSHIP_INVALID', message: 'Organization foundation must not become a user account, marketplace seller, or payment system owner.' });
  if (ownershipRef.duplicateOwnership === true) errors.push({ field: 'ownershipRef.duplicateOwnership', code: 'ORGANIZATION_OWNERSHIP_INVALID', message: 'Duplicate organization ownership is forbidden.' });
  if (ownershipRef.transferRequested === true && ownershipRef.transferAuthorized !== true) errors.push({ field: 'ownershipRef.transferAuthorized', code: 'ORGANIZATION_OWNERSHIP_INVALID', message: 'Unauthorized organization ownership transfer is forbidden.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
