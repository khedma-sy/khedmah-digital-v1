import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { ORGANIZATION_IDENTITY_REFERENCE_PATTERN, ORGANIZATION_MEMBER_REFERENCE_PATTERN, ORGANIZATION_ROLE_REFERENCE_PATTERN, OrganizationStatus, OrganizationType, OrganizationVisibility, PROFILE_REFERENCE_PATTERN, REQUIRED_ORGANIZATION_FIELDS, USER_ACCOUNT_REFERENCE_PATTERN } from '../domain/organization-types.mjs';
import { validateOrganizationMembershipReferences } from '../domain/membership.mjs';
import { validateOrganizationOwnershipReference } from '../domain/ownership.mjs';

const organizationTypes = Object.freeze(Object.values(OrganizationType));
const organizationStatuses = Object.freeze(Object.values(OrganizationStatus));
const organizationVisibilities = Object.freeze(Object.values(OrganizationVisibility));

function validateMembershipReferencePatterns(membershipRefs = []) {
  const errors = [];
  const refs = Array.isArray(membershipRefs) ? membershipRefs : [];
  refs.forEach((membershipRef, index) => {
    if (!ORGANIZATION_MEMBER_REFERENCE_PATTERN.test(String(membershipRef.memberRef || ''))) errors.push({ field: `membershipRefs.${index}.memberRef`, code: 'INVALID_FORMAT', message: 'memberRef must be a safe organization member reference.' });
    if (!ORGANIZATION_ROLE_REFERENCE_PATTERN.test(String(membershipRef.roleRef || ''))) errors.push({ field: `membershipRefs.${index}.roleRef`, code: 'INVALID_FORMAT', message: 'roleRef must be a safe organization role reference.' });
  });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateOrganizationFoundation(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_ORGANIZATION_FIELDS),
    validateAllowedValue('organizationType', value.organizationType, organizationTypes),
    validateAllowedValue('status', value.status, organizationStatuses),
    validateAllowedValue('visibility', value.visibility, organizationVisibilities),
    validatePattern('organizationIdentityRef', value.organizationIdentityRef, ORGANIZATION_IDENTITY_REFERENCE_PATTERN, 'organizationIdentityRef must be a safe organization identity reference.'),
    validatePattern('profileRef', value.profileRef, PROFILE_REFERENCE_PATTERN, 'profileRef must be a safe base profile reference.'),
    validatePattern('ownershipRef.userAccountRef', value.ownershipRef?.userAccountRef, USER_ACCOUNT_REFERENCE_PATTERN, 'ownershipRef.userAccountRef must be a safe user account reference.'),
    validatePattern('ownershipRef.profileRef', value.ownershipRef?.profileRef, PROFILE_REFERENCE_PATTERN, 'ownershipRef.profileRef must be a safe base profile reference.'),
    validateOrganizationOwnershipReference(value.ownershipRef),
    validateOrganizationMembershipReferences(value.membershipRefs),
    validateMembershipReferencePatterns(value.membershipRefs),
  );
}

export { organizationStatuses as APPROVED_ORGANIZATION_STATUSES, organizationTypes as APPROVED_ORGANIZATION_TYPES, organizationVisibilities as APPROVED_ORGANIZATION_VISIBILITIES };
