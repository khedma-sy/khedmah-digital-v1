export const OrganizationMembershipCompatibility = Object.freeze({
  ORGANIZATION_TO_MEMBERS_TO_ROLES: 'organization_to_members_to_roles',
  MEMBERSHIP_REFERENCE_ONLY: 'membership_reference_only',
  ROLE_REFERENCE_ONLY: 'role_reference_only',
});

export const ForbiddenOrganizationMembershipRule = Object.freeze({
  AUTOMATIC_OWNERSHIP_FROM_MEMBERSHIP: 'automatic_ownership_from_membership',
  MEMBER_OWNER_CONFUSION: 'member_owner_confusion',
  EMPLOYEE_MANAGEMENT: 'employee_management',
  PERMISSIONS_ENGINE: 'permissions_engine',
  HR_OR_PAYROLL: 'hr_or_payroll',
});

export function validateOrganizationMembershipReferences(membershipRefs = []) {
  const errors = [];
  if (!Array.isArray(membershipRefs)) errors.push({ field: 'membershipRefs', code: 'ORGANIZATION_MEMBER_INVALID', message: 'Organization membership references must be an array.' });
  const refs = Array.isArray(membershipRefs) ? membershipRefs : [];
  refs.forEach((membershipRef, index) => {
    if (typeof membershipRef.memberRef !== 'string' || membershipRef.memberRef.length === 0) errors.push({ field: `membershipRefs.${index}.memberRef`, code: 'ORGANIZATION_MEMBER_INVALID', message: 'Membership reference requires a member reference.' });
    if (typeof membershipRef.roleRef !== 'string' || membershipRef.roleRef.length === 0) errors.push({ field: `membershipRefs.${index}.roleRef`, code: 'ORGANIZATION_MEMBER_INVALID', message: 'Membership reference requires a role reference.' });
    if (membershipRef.impliesOwnership === true || membershipRef.ownerRef) errors.push({ field: `membershipRefs.${index}`, code: 'ORGANIZATION_MEMBER_INVALID', message: 'Membership references must not imply ownership or confuse member with owner.' });
    if (membershipRef.employeeRecordRef || membershipRef.payrollRef || membershipRef.hrRecordRef || membershipRef.permissionGrantRef) errors.push({ field: `membershipRefs.${index}`, code: 'ORGANIZATION_MEMBER_INVALID', message: 'Employee, payroll, HR, and permission engine references are outside organization foundation scope.' });
  });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
