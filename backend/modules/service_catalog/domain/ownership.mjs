export const ServiceOwnershipBoundary = Object.freeze({
  BUSINESS_PROFILE_PROVIDES_SERVICES: 'business_profile_provides_services',
  PROFESSIONAL_PROFILE_PROVIDES_PROFESSIONAL_SERVICES: 'professional_profile_provides_professional_services',
  ORGANIZATION_PROVIDES_ORGANIZATIONAL_SERVICES: 'organization_provides_organizational_services',
  SERVICE_IS_PROVIDED_ENTITY_ONLY: 'service_is_provided_entity_only',
});

export const ServiceOwnerModule = Object.freeze({
  BUSINESS_PROFILES: 'business_profiles',
  PROFESSIONAL_PROFILES: 'professional_profiles',
  ORGANIZATIONS: 'organizations',
});

export const ForbiddenServiceOwnershipRule = Object.freeze({
  SERVICE_AS_OWNER: 'service_as_owner',
  SERVICE_OWNS_PAYMENTS: 'service_owns_payments',
  SERVICE_OWNS_MARKETPLACE_BEHAVIOR: 'service_owns_marketplace_behavior',
  DUPLICATE_SERVICE_OWNERSHIP: 'duplicate_service_ownership',
  UNAUTHORIZED_OWNERSHIP_TRANSFER: 'unauthorized_ownership_transfer',
});

export function validateServiceOwnershipReference(ownershipRef = {}) {
  const errors = [];
  const allowedOwnerModules = Object.values(ServiceOwnerModule);
  if (!allowedOwnerModules.includes(ownershipRef.ownerModule)) errors.push({ field: 'ownershipRef.ownerModule', code: 'SERVICE_OWNERSHIP_INVALID', message: 'Service ownership must point to business_profiles, professional_profiles, or organizations only.' });
  if (typeof ownershipRef.ownerRef !== 'string' || ownershipRef.ownerRef.length === 0) errors.push({ field: 'ownershipRef.ownerRef', code: 'SERVICE_OWNERSHIP_INVALID', message: 'Service ownership requires a provider owner reference.' });
  if (ownershipRef.serviceOwnerRef || ownershipRef.paymentAccountRef || ownershipRef.paymentSystemRef || ownershipRef.marketplaceBehaviorRef || ownershipRef.marketplaceSellerRef) errors.push({ field: 'ownershipRef', code: 'SERVICE_OWNERSHIP_INVALID', message: 'Service cannot become an owner or own payments or marketplace behavior.' });
  if (ownershipRef.duplicateServiceOwnership === true) errors.push({ field: 'ownershipRef.duplicateServiceOwnership', code: 'SERVICE_OWNERSHIP_INVALID', message: 'Duplicate service ownership is forbidden.' });
  if (ownershipRef.transferRequested === true && ownershipRef.transferAuthorized !== true) errors.push({ field: 'ownershipRef.transferAuthorized', code: 'SERVICE_OWNERSHIP_INVALID', message: 'Unauthorized service ownership transfer is forbidden.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
