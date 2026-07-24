export const LocationOwnershipBoundary = Object.freeze({
  BUSINESS_PROFILE_OWNS_BUSINESS_IDENTITY: 'business_profile_owns_business_identity',
  PROFESSIONAL_PROFILE_OWNS_PROFESSIONAL_IDENTITY: 'professional_profile_owns_professional_identity',
  ORGANIZATION_OWNS_ORGANIZATION_IDENTITY: 'organization_owns_organization_identity',
  LOCATION_PROVIDES_GEOGRAPHIC_REFERENCE_ONLY: 'location_provides_geographic_reference_only',
});

export const LocationOwnerReferenceType = Object.freeze({
  BUSINESS_PROFILE: 'business_profile',
  PROFESSIONAL_PROFILE: 'professional_profile',
  ORGANIZATION: 'organization',
  PROFILE: 'profile',
});

export const ForbiddenLocationOwnershipRule = Object.freeze({
  LOCATION_OWNERSHIP: 'location_ownership',
  DUPLICATE_LOCATION_OWNERSHIP: 'duplicate_location_ownership',
  UNAUTHORIZED_OWNERSHIP_TRANSFER: 'unauthorized_ownership_transfer',
});

export function validateLocationOwnershipReference(ownershipRef = {}) {
  const errors = [];
  if (!Object.values(LocationOwnerReferenceType).includes(ownershipRef.ownerReferenceType)) errors.push({ field: 'ownershipRef.ownerReferenceType', code: 'LOCATION_OWNERSHIP_INVALID', message: 'Location ownership reference type is unsupported.' });
  if (typeof ownershipRef.ownerRef !== 'string' || ownershipRef.ownerRef.length === 0) errors.push({ field: 'ownershipRef.ownerRef', code: 'LOCATION_OWNERSHIP_INVALID', message: 'Location ownership requires a profile or organization reference.' });
  if (ownershipRef.locationOwnerRef || ownershipRef.locationOwnsEntity === true) errors.push({ field: 'ownershipRef', code: 'LOCATION_OWNERSHIP_INVALID', message: 'Location provides geographic reference only and cannot become an owner.' });
  if (ownershipRef.duplicateLocationOwnership === true) errors.push({ field: 'ownershipRef.duplicateLocationOwnership', code: 'LOCATION_OWNERSHIP_INVALID', message: 'Duplicate location ownership is forbidden.' });
  if (ownershipRef.transferRequested === true && ownershipRef.transferAuthorized !== true) errors.push({ field: 'ownershipRef.transferAuthorized', code: 'LOCATION_OWNERSHIP_INVALID', message: 'Unauthorized location ownership transfer is forbidden.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
