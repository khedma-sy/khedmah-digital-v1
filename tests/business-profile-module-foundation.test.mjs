import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { BusinessProfileAuditEvent, isBusinessProfileAuditEventName } from '../backend/modules/business_profiles/domain/audit-events.mjs';
import { createBusinessProfileError, BusinessProfileErrorCode } from '../backend/modules/business_profiles/domain/errors.mjs';
import { canTransitionBusinessLifecycle, validateBusinessLifecycleTransition } from '../backend/modules/business_profiles/domain/lifecycle.mjs';
import { BusinessOwnershipBoundary, ForbiddenBusinessOwnershipRule, validateBusinessOwnershipReference } from '../backend/modules/business_profiles/domain/ownership.mjs';
import { BusinessProfileConcept, BusinessStatus, BusinessType, BusinessVisibility } from '../backend/modules/business_profiles/domain/business-types.mjs';
import { assertNoBusinessSensitiveExposure, BusinessProfileSecurityPolicy } from '../backend/modules/business_profiles/domain/security-policy.mjs';
import { BusinessVisibilityClass, validateBusinessVisibilityExposure } from '../backend/modules/business_profiles/domain/visibility.mjs';
import { APPROVED_BUSINESS_STATUSES, APPROVED_BUSINESS_TYPES, APPROVED_BUSINESS_VISIBILITIES, validateBusinessProfileFoundation } from '../backend/modules/business_profiles/schemas/business-profile-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validBusinessProfile = Object.freeze({
  businessIdentityRef: 'business_identity:restaurant-001',
  profileRef: 'profile:business-001',
  businessType: BusinessType.RESTAURANT,
  visibility: BusinessVisibility.PUBLIC,
  status: BusinessStatus.CREATED,
  ownershipRef: Object.freeze({ ownerModule: 'users', userAccountRef: 'user_account:user-001', profileRef: 'profile:business-001' }),
});

test('business profile module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/business_profiles/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('business concepts stay separate from user account, profile, professional profile, organization, supplier, and partner implementations', () => {
  assert.equal(BusinessProfileConcept.BUSINESS_PROFILE, 'Business Profile');
  assert.equal(BusinessProfileConcept.BUSINESS_IDENTITY, 'Business Identity');
  assert.equal(BusinessOwnershipBoundary.USER_ACCOUNT_OWNS_IDENTITY_RELATIONSHIP, 'user_account_owns_identity_relationship');
  assert.equal(BusinessOwnershipBoundary.PROFILE_REPRESENTS_PUBLIC_IDENTITY_LAYER, 'profile_represents_public_identity_layer');
  assert.equal(BusinessOwnershipBoundary.BUSINESS_PROFILE_REPRESENTS_BUSINESS_IDENTITY, 'business_profile_represents_business_identity');
});

test('business types are future-compatible references only', () => {
  assert.deepEqual(APPROVED_BUSINESS_TYPES, Object.values(BusinessType));
  assert.ok(APPROVED_BUSINESS_TYPES.includes(BusinessType.RESTAURANT));
  assert.ok(APPROVED_BUSINESS_TYPES.includes(BusinessType.SHOP));
  assert.ok(APPROVED_BUSINESS_TYPES.includes(BusinessType.WORKSHOP));
  assert.ok(APPROVED_BUSINESS_TYPES.includes(BusinessType.SERVICE_BUSINESS));
  assert.ok(APPROVED_BUSINESS_TYPES.includes(BusinessType.RETAIL_BUSINESS));
  assert.ok(APPROVED_BUSINESS_TYPES.includes(BusinessType.FACTORY));
  assert.ok(APPROVED_BUSINESS_TYPES.includes(BusinessType.SUPPLIER_BUSINESS));
  assert.ok(APPROVED_BUSINESS_TYPES.includes(BusinessType.COMPANY));
});

test('business ownership boundaries reject organization conversion, marketplace seller scope, duplicates, and unauthorized transfer', () => {
  assert.equal(validateBusinessOwnershipReference(validBusinessProfile.ownershipRef).valid, true);
  assert.equal(ForbiddenBusinessOwnershipRule.BUSINESS_PROFILE_AS_ORGANIZATION, 'business_profile_as_organization');
  assert.equal(ForbiddenBusinessOwnershipRule.BUSINESS_PROFILE_AS_MARKETPLACE_SELLER, 'business_profile_as_marketplace_seller');
  const invalid = validateBusinessOwnershipReference({ ownerModule: 'marketplace', userAccountRef: 'user_account:user-001', profileRef: 'profile:business-001', organizationEntityRef: 'organization:001', marketplaceSellerRef: 'seller:001', productCatalogRef: 'catalog:001', duplicateBusinessOwnership: true, transferRequested: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.code === 'BUSINESS_OWNERSHIP_INVALID'));
});

test('business visibility rules define public, private, and internal classes and prevent sensitive exposure', () => {
  assert.deepEqual(APPROVED_BUSINESS_VISIBILITIES, Object.values(BusinessVisibility));
  assert.ok(BusinessVisibilityClass.public.includes('businessDisplayName'));
  assert.ok(BusinessVisibilityClass.public.includes('publicDescriptionRef'));
  assert.ok(BusinessVisibilityClass.public.includes('categoryRef'));
  assert.ok(BusinessVisibilityClass.private.includes('privateContactRef'));
  assert.ok(BusinessVisibilityClass.internal.includes('operationalMetadataRef'));
  assert.equal(validateBusinessVisibilityExposure({ visibility: BusinessVisibility.PUBLIC, fieldClass: BusinessVisibility.PUBLIC }).valid, true);
  assert.equal(validateBusinessVisibilityExposure({ visibility: BusinessVisibility.PUBLIC, fieldClass: BusinessVisibility.PRIVATE }).valid, false);
  assert.equal(validateBusinessVisibilityExposure({ visibility: BusinessVisibility.PUBLIC, fieldClass: BusinessVisibility.PUBLIC, exposesVerificationEvidence: true }).valid, false);
});

test('business lifecycle compatibility reuses Created, Pending, Active, Suspended, and Archived profile states', () => {
  assert.deepEqual(APPROVED_BUSINESS_STATUSES, Object.values(BusinessStatus));
  assert.equal(canTransitionBusinessLifecycle(BusinessStatus.CREATED, BusinessStatus.PENDING), true);
  assert.equal(canTransitionBusinessLifecycle(BusinessStatus.PENDING, BusinessStatus.ACTIVE), true);
  assert.equal(canTransitionBusinessLifecycle(BusinessStatus.ACTIVE, BusinessStatus.SUSPENDED), true);
  assert.equal(canTransitionBusinessLifecycle(BusinessStatus.SUSPENDED, BusinessStatus.ACTIVE), true);
  assert.equal(canTransitionBusinessLifecycle(BusinessStatus.ACTIVE, BusinessStatus.ARCHIVED), true);
  assert.equal(canTransitionBusinessLifecycle(BusinessStatus.ARCHIVED, BusinessStatus.ACTIVE), false);
  assert.equal(validateBusinessLifecycleTransition(BusinessStatus.CREATED, BusinessStatus.ACTIVE).valid, false);
});

test('business validation checks business type, status, visibility, ownership, and required identity references only', () => {
  assert.equal(validateBusinessProfileFoundation(validBusinessProfile).valid, true);
  const invalid = validateBusinessProfileFoundation({ businessIdentityRef: 'payment:001', profileRef: 'organization:001', businessType: 'marketplace_seller', visibility: 'public', status: 'paid', ownershipRef: { ownerModule: 'marketplace' } });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'businessIdentityRef'));
  assert.ok(invalid.errors.some((error) => error.field === 'businessType'));
  assert.ok(invalid.errors.some((error) => error.field === 'ownershipRef.ownerModule'));
});

test('business profile foundation remains compatible with identity, users, and profiles by reference only', async () => {
  const readme = await read('backend/modules/business_profiles/README.md');
  assert.match(readme, /User Account owns the identity relationship/);
  assert.match(readme, /Profile represents the public identity layer/);
  assert.match(readme, /Business Profile represents business identity/);
  assert.match(readme, /backend\/modules\/identity/);
  assert.match(readme, /backend\/modules\/users/);
  assert.match(readme, /backend\/modules\/profiles/);
});

test('business profile errors are compatible with Mission 052 core errors', () => {
  const invalid = createBusinessProfileError(BusinessProfileErrorCode.BUSINESS_PROFILE_INVALID, 'Invalid business profile.');
  const duplicate = createBusinessProfileError(BusinessProfileErrorCode.BUSINESS_PROFILE_DUPLICATE, 'Duplicate business profile.');
  const ownership = createBusinessProfileError(BusinessProfileErrorCode.BUSINESS_OWNERSHIP_INVALID, 'Invalid business ownership.');
  const lifecycle = createBusinessProfileError(BusinessProfileErrorCode.BUSINESS_LIFECYCLE_INVALID, 'Invalid business lifecycle.');
  assert.ok(invalid instanceof KhedmahCoreError);
  assert.equal(invalid.category, ErrorCategory.VALIDATION);
  assert.equal(duplicate.category, ErrorCategory.DUPLICATE);
  assert.equal(ownership.category, ErrorCategory.OWNERSHIP);
  assert.equal(lifecycle.category, ErrorCategory.LIFECYCLE);
});

test('business profile audit events are future-compatible constants only', () => {
  assert.equal(BusinessProfileAuditEvent.BUSINESS_PROFILE_CREATED, 'BUSINESS_PROFILE_CREATED');
  assert.equal(BusinessProfileAuditEvent.BUSINESS_PROFILE_UPDATED, 'BUSINESS_PROFILE_UPDATED');
  assert.equal(BusinessProfileAuditEvent.BUSINESS_PROFILE_STATUS_CHANGED, 'BUSINESS_PROFILE_STATUS_CHANGED');
  assert.equal(BusinessProfileAuditEvent.BUSINESS_PROFILE_ARCHIVED, 'BUSINESS_PROFILE_ARCHIVED');
  assert.equal(BusinessProfileAuditEvent.BUSINESS_PROFILE_OWNERSHIP_CHANGED, 'BUSINESS_PROFILE_OWNERSHIP_CHANGED');
  assert.ok(Object.values(BusinessProfileAuditEvent).every(isBusinessProfileAuditEventName));
});

test('business profile dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/business_profiles/domain/business-types.mjs',
    'backend/modules/business_profiles/domain/ownership.mjs',
    'backend/modules/business_profiles/domain/visibility.mjs',
    'backend/modules/business_profiles/domain/lifecycle.mjs',
    'backend/modules/business_profiles/domain/errors.mjs',
    'backend/modules/business_profiles/domain/audit-events.mjs',
    'backend/modules/business_profiles/domain/security-policy.mjs',
    'backend/modules/business_profiles/schemas/business-profile-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|organizations|service_catalog|locations|trust_verification|relationships|analytics|payments|marketplace|apps\/backend|frontend)/);
  assert.doesNotMatch(content, /controller|route|migration|database connection/i);
});

test('business profile security boundaries expose no passwords, tokens, credentials, secrets, financial data, or payment data', () => {
  assert.equal(BusinessProfileSecurityPolicy.storesSecretsOrCredentials, false);
  assert.equal(BusinessProfileSecurityPolicy.storesFinancialData, false);
  assert.equal(BusinessProfileSecurityPolicy.storesPaymentData, false);
  assert.deepEqual(assertNoBusinessSensitiveExposure({ businessIdentityRef: 'business_identity:restaurant-001' }), { valid: true, exposed: [] });
  assert.equal(assertNoBusinessSensitiveExposure({ paymentData: 'never' }).valid, false);
});

test('business profile foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/business_profiles/README.md');
  assert.match(readme, /does not create marketplace seller systems, product catalogs, inventory, orders, checkout, payment accounts, commission systems, advertising profiles, ranking manipulation, social profiles, followers, AI business scoring, or tracking profiles/);
  assert.match(readme, /No workflow engine is implemented/);
});
