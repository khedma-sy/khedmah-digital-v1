import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { OrganizationAuditEvent, isOrganizationAuditEventName } from '../backend/modules/organizations/domain/audit-events.mjs';
import { createOrganizationError, OrganizationErrorCode } from '../backend/modules/organizations/domain/errors.mjs';
import { canTransitionOrganizationLifecycle, validateOrganizationLifecycleTransition } from '../backend/modules/organizations/domain/lifecycle.mjs';
import { ForbiddenOrganizationMembershipRule, OrganizationMembershipCompatibility, validateOrganizationMembershipReferences } from '../backend/modules/organizations/domain/membership.mjs';
import { ForbiddenOrganizationOwnershipRule, OrganizationOwnershipBoundary, validateOrganizationOwnershipReference } from '../backend/modules/organizations/domain/ownership.mjs';
import { OrganizationConcept, OrganizationStatus, OrganizationType, OrganizationVisibility } from '../backend/modules/organizations/domain/organization-types.mjs';
import { assertNoOrganizationSensitiveExposure, OrganizationSecurityPolicy } from '../backend/modules/organizations/domain/security-policy.mjs';
import { OrganizationVisibilityClass, validateOrganizationVisibilityExposure } from '../backend/modules/organizations/domain/visibility.mjs';
import { APPROVED_ORGANIZATION_STATUSES, APPROVED_ORGANIZATION_TYPES, APPROVED_ORGANIZATION_VISIBILITIES, validateOrganizationFoundation } from '../backend/modules/organizations/schemas/organization-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validOrganization = Object.freeze({
  organizationIdentityRef: 'organization_identity:company-001',
  profileRef: 'profile:organization-001',
  organizationType: OrganizationType.COMPANY,
  visibility: OrganizationVisibility.PUBLIC,
  status: OrganizationStatus.CREATED,
  ownershipRef: Object.freeze({ ownerModule: 'users', userAccountRef: 'user_account:user-001', profileRef: 'profile:organization-001' }),
  membershipRefs: Object.freeze([{ memberRef: 'organization_member:member-001', roleRef: 'organization_role:admin-001' }]),
});

test('organization module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/organizations/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('organization concepts stay separate from user account, profile, professional, business, supplier, and partner implementations', () => {
  assert.equal(OrganizationConcept.ORGANIZATION, 'Organization');
  assert.equal(OrganizationConcept.ORGANIZATION_IDENTITY, 'Organization Identity');
  assert.equal(OrganizationConcept.ORGANIZATION_MEMBERSHIP_REFERENCE, 'Organization Membership Reference');
  assert.equal(OrganizationOwnershipBoundary.USER_ACCOUNT_OWNS_IDENTITY_RELATIONSHIP, 'user_account_owns_identity_relationship');
  assert.equal(OrganizationOwnershipBoundary.PROFILE_REPRESENTS_PUBLIC_IDENTITY, 'profile_represents_public_identity');
  assert.equal(OrganizationOwnershipBoundary.ORGANIZATION_REPRESENTS_ORGANIZATIONAL_STRUCTURE, 'organization_represents_organizational_structure');
});

test('organization types are future-compatible references only', () => {
  assert.deepEqual(APPROVED_ORGANIZATION_TYPES, Object.values(OrganizationType));
  assert.ok(APPROVED_ORGANIZATION_TYPES.includes(OrganizationType.COMPANY));
  assert.ok(APPROVED_ORGANIZATION_TYPES.includes(OrganizationType.FACTORY));
  assert.ok(APPROVED_ORGANIZATION_TYPES.includes(OrganizationType.HOSPITAL));
  assert.ok(APPROVED_ORGANIZATION_TYPES.includes(OrganizationType.SCHOOL));
  assert.ok(APPROVED_ORGANIZATION_TYPES.includes(OrganizationType.INSTITUTION));
  assert.ok(APPROVED_ORGANIZATION_TYPES.includes(OrganizationType.LARGE_ORGANIZATION));
});

test('organization ownership boundaries reject user-account conversion, marketplace seller scope, payments, duplicates, and unauthorized transfer', () => {
  assert.equal(validateOrganizationOwnershipReference(validOrganization.ownershipRef).valid, true);
  assert.equal(ForbiddenOrganizationOwnershipRule.ORGANIZATION_AS_USER_ACCOUNT, 'organization_as_user_account');
  assert.equal(ForbiddenOrganizationOwnershipRule.ORGANIZATION_OWNS_PAYMENT_SYSTEMS, 'organization_owns_payment_systems');
  const invalid = validateOrganizationOwnershipReference({ ownerModule: 'marketplace', userAccountRef: 'user_account:user-001', profileRef: 'profile:organization-001', userAccountEntityRef: 'user:001', marketplaceSellerRef: 'seller:001', paymentSystemRef: 'payment:001', duplicateOwnership: true, transferRequested: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.code === 'ORGANIZATION_OWNERSHIP_INVALID'));
});

test('organization membership compatibility is references only and prevents member owner confusion', () => {
  assert.equal(OrganizationMembershipCompatibility.ORGANIZATION_TO_MEMBERS_TO_ROLES, 'organization_to_members_to_roles');
  assert.equal(ForbiddenOrganizationMembershipRule.AUTOMATIC_OWNERSHIP_FROM_MEMBERSHIP, 'automatic_ownership_from_membership');
  assert.equal(validateOrganizationMembershipReferences(validOrganization.membershipRefs).valid, true);
  const invalid = validateOrganizationMembershipReferences([{ memberRef: 'organization_member:member-001', roleRef: 'organization_role:admin-001', impliesOwnership: true, employeeRecordRef: 'employee:001', payrollRef: 'payroll:001' }]);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.code === 'ORGANIZATION_MEMBER_INVALID'));
});

test('organization visibility rules define public, private, and internal classes and prevent private/internal exposure', () => {
  assert.deepEqual(APPROVED_ORGANIZATION_VISIBILITIES, Object.values(OrganizationVisibility));
  assert.ok(OrganizationVisibilityClass.public.includes('organizationName'));
  assert.ok(OrganizationVisibilityClass.public.includes('publicDescriptionRef'));
  assert.ok(OrganizationVisibilityClass.public.includes('organizationType'));
  assert.ok(OrganizationVisibilityClass.private.includes('privateContactRef'));
  assert.ok(OrganizationVisibilityClass.internal.includes('operationalMetadataRef'));
  assert.equal(validateOrganizationVisibilityExposure({ visibility: OrganizationVisibility.PUBLIC, fieldClass: OrganizationVisibility.PUBLIC }).valid, true);
  assert.equal(validateOrganizationVisibilityExposure({ visibility: OrganizationVisibility.PUBLIC, fieldClass: OrganizationVisibility.PRIVATE }).valid, false);
});

test('organization lifecycle compatibility reuses Created, Pending, Active, Suspended, and Archived profile states', () => {
  assert.deepEqual(APPROVED_ORGANIZATION_STATUSES, Object.values(OrganizationStatus));
  assert.equal(canTransitionOrganizationLifecycle(OrganizationStatus.CREATED, OrganizationStatus.PENDING), true);
  assert.equal(canTransitionOrganizationLifecycle(OrganizationStatus.PENDING, OrganizationStatus.ACTIVE), true);
  assert.equal(canTransitionOrganizationLifecycle(OrganizationStatus.ACTIVE, OrganizationStatus.SUSPENDED), true);
  assert.equal(canTransitionOrganizationLifecycle(OrganizationStatus.SUSPENDED, OrganizationStatus.ACTIVE), true);
  assert.equal(canTransitionOrganizationLifecycle(OrganizationStatus.ACTIVE, OrganizationStatus.ARCHIVED), true);
  assert.equal(canTransitionOrganizationLifecycle(OrganizationStatus.ARCHIVED, OrganizationStatus.ACTIVE), false);
  assert.equal(validateOrganizationLifecycleTransition(OrganizationStatus.CREATED, OrganizationStatus.ACTIVE).valid, false);
});

test('organization validation checks identity, type, status, visibility, ownership, and membership references only', () => {
  assert.equal(validateOrganizationFoundation(validOrganization).valid, true);
  const invalid = validateOrganizationFoundation({ organizationIdentityRef: 'employee:001', profileRef: 'business:001', organizationType: 'marketplace_org', visibility: 'public', status: 'paid', ownershipRef: { ownerModule: 'marketplace' }, membershipRefs: [{ memberRef: 'employee:001', roleRef: 'payroll:001', ownerRef: 'owner:001' }] });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'organizationIdentityRef'));
  assert.ok(invalid.errors.some((error) => error.field === 'organizationType'));
  assert.ok(invalid.errors.some((error) => error.field === 'ownershipRef.ownerModule'));
  assert.ok(invalid.errors.some((error) => error.code === 'ORGANIZATION_MEMBER_INVALID'));
});

test('organization foundation remains compatible with identity, users, and profiles by reference only', async () => {
  const readme = await read('backend/modules/organizations/README.md');
  assert.match(readme, /User Account owns the identity relationship/);
  assert.match(readme, /Profile represents public identity/);
  assert.match(readme, /Organization represents organizational structure/);
  assert.match(readme, /backend\/modules\/identity/);
  assert.match(readme, /backend\/modules\/users/);
  assert.match(readme, /backend\/modules\/profiles/);
});

test('organization errors are compatible with Mission 052 core errors', () => {
  const invalid = createOrganizationError(OrganizationErrorCode.ORGANIZATION_INVALID, 'Invalid organization.');
  const duplicate = createOrganizationError(OrganizationErrorCode.ORGANIZATION_DUPLICATE, 'Duplicate organization.');
  const ownership = createOrganizationError(OrganizationErrorCode.ORGANIZATION_OWNERSHIP_INVALID, 'Invalid organization ownership.');
  const member = createOrganizationError(OrganizationErrorCode.ORGANIZATION_MEMBER_INVALID, 'Invalid organization member.');
  const lifecycle = createOrganizationError(OrganizationErrorCode.ORGANIZATION_LIFECYCLE_INVALID, 'Invalid organization lifecycle.');
  assert.ok(invalid instanceof KhedmahCoreError);
  assert.equal(invalid.category, ErrorCategory.VALIDATION);
  assert.equal(duplicate.category, ErrorCategory.DUPLICATE);
  assert.equal(ownership.category, ErrorCategory.OWNERSHIP);
  assert.equal(member.category, ErrorCategory.VALIDATION);
  assert.equal(lifecycle.category, ErrorCategory.LIFECYCLE);
});

test('organization audit events are future-compatible constants only', () => {
  assert.equal(OrganizationAuditEvent.ORGANIZATION_CREATED, 'ORGANIZATION_CREATED');
  assert.equal(OrganizationAuditEvent.ORGANIZATION_UPDATED, 'ORGANIZATION_UPDATED');
  assert.equal(OrganizationAuditEvent.ORGANIZATION_STATUS_CHANGED, 'ORGANIZATION_STATUS_CHANGED');
  assert.equal(OrganizationAuditEvent.ORGANIZATION_ARCHIVED, 'ORGANIZATION_ARCHIVED');
  assert.equal(OrganizationAuditEvent.ORGANIZATION_OWNERSHIP_CHANGED, 'ORGANIZATION_OWNERSHIP_CHANGED');
  assert.equal(OrganizationAuditEvent.ORGANIZATION_MEMBER_CHANGED, 'ORGANIZATION_MEMBER_CHANGED');
  assert.ok(Object.values(OrganizationAuditEvent).every(isOrganizationAuditEventName));
});

test('organization dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/organizations/domain/organization-types.mjs',
    'backend/modules/organizations/domain/ownership.mjs',
    'backend/modules/organizations/domain/membership.mjs',
    'backend/modules/organizations/domain/visibility.mjs',
    'backend/modules/organizations/domain/lifecycle.mjs',
    'backend/modules/organizations/domain/errors.mjs',
    'backend/modules/organizations/domain/audit-events.mjs',
    'backend/modules/organizations/domain/security-policy.mjs',
    'backend/modules/organizations/schemas/organization-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|business_profiles|service_catalog|locations|trust_verification|relationships|analytics|payments|marketplace|apps\/backend|frontend)/);
  assert.doesNotMatch(content, /controller|route|migration|database connection/i);
});

test('organization security boundaries expose no passwords, tokens, credentials, secrets, or financial information', () => {
  assert.equal(OrganizationSecurityPolicy.storesSecretsOrCredentials, false);
  assert.equal(OrganizationSecurityPolicy.storesFinancialInformation, false);
  assert.deepEqual(assertNoOrganizationSensitiveExposure({ organizationIdentityRef: 'organization_identity:company-001' }), { valid: true, exposed: [] });
  assert.equal(assertNoOrganizationSensitiveExposure({ financialInformation: 'never' }).valid, false);
});

test('organization foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/organizations/README.md');
  assert.match(readme, /does not create HR systems, employee databases, payroll, ERP, marketplace organizations, payment accounts, commission systems, advertising profiles, ranking systems, social organizations, AI organization scoring, or tracking systems/);
  assert.match(readme, /No workflow engine is implemented/);
});
