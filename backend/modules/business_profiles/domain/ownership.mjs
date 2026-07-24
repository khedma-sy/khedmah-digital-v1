export const BusinessOwnershipBoundary = Object.freeze({
  USER_ACCOUNT_OWNS_IDENTITY_RELATIONSHIP: 'user_account_owns_identity_relationship',
  PROFILE_REPRESENTS_PUBLIC_IDENTITY_LAYER: 'profile_represents_public_identity_layer',
  BUSINESS_PROFILE_REPRESENTS_BUSINESS_IDENTITY: 'business_profile_represents_business_identity',
  ORGANIZATION_REPRESENTS_ORGANIZATIONAL_STRUCTURE: 'organization_represents_organizational_structure',
  SUPPLIER_REPRESENTS_SUPPLY_NETWORK_IDENTITY: 'supplier_represents_supply_network_identity',
});

export const ForbiddenBusinessOwnershipRule = Object.freeze({
  BUSINESS_PROFILE_AS_ORGANIZATION: 'business_profile_as_organization',
  BUSINESS_PROFILE_AS_MARKETPLACE_SELLER: 'business_profile_as_marketplace_seller',
  DUPLICATE_BUSINESS_OWNERSHIP: 'duplicate_business_ownership',
  UNAUTHORIZED_OWNERSHIP_TRANSFER: 'unauthorized_ownership_transfer',
});

export function validateBusinessOwnershipReference(ownershipRef = {}) {
  const errors = [];
  if (ownershipRef.ownerModule !== 'users') errors.push({ field: 'ownershipRef.ownerModule', code: 'BUSINESS_OWNERSHIP_INVALID', message: 'Business profile ownership reference must point to the users module only.' });
  if (typeof ownershipRef.userAccountRef !== 'string' || ownershipRef.userAccountRef.length === 0) errors.push({ field: 'ownershipRef.userAccountRef', code: 'BUSINESS_OWNERSHIP_INVALID', message: 'Business profile ownership requires a user account reference.' });
  if (typeof ownershipRef.profileRef !== 'string' || ownershipRef.profileRef.length === 0) errors.push({ field: 'ownershipRef.profileRef', code: 'BUSINESS_OWNERSHIP_INVALID', message: 'Business profile ownership requires a base profile reference.' });
  if (ownershipRef.organizationEntityRef || ownershipRef.supplierEntityRef) errors.push({ field: 'ownershipRef', code: 'BUSINESS_OWNERSHIP_INVALID', message: 'Business profile foundation must not own organizations or supplier network identities.' });
  if (ownershipRef.marketplaceSellerRef || ownershipRef.productCatalogRef || ownershipRef.inventoryRef || ownershipRef.paymentAccountRef) errors.push({ field: 'ownershipRef', code: 'BUSINESS_OWNERSHIP_INVALID', message: 'Business profile foundation must not become a marketplace seller or commerce entity.' });
  if (ownershipRef.duplicateBusinessOwnership === true) errors.push({ field: 'ownershipRef.duplicateBusinessOwnership', code: 'BUSINESS_OWNERSHIP_INVALID', message: 'Duplicate business ownership is forbidden.' });
  if (ownershipRef.transferRequested === true && ownershipRef.transferAuthorized !== true) errors.push({ field: 'ownershipRef.transferAuthorized', code: 'BUSINESS_OWNERSHIP_INVALID', message: 'Unauthorized business ownership transfer is forbidden.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
