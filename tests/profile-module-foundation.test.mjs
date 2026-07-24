import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { ProfileAuditEvent, isProfileAuditEventName } from '../backend/modules/profiles/domain/audit-events.mjs';
import { createProfileError, ProfileErrorCode } from '../backend/modules/profiles/domain/errors.mjs';
import { canTransitionProfileLifecycle, validateProfileLifecycleTransition } from '../backend/modules/profiles/domain/lifecycle.mjs';
import { ForbiddenProfileOwnershipRule, ProfileOwnershipBoundary, validateProfileOwnershipReference } from '../backend/modules/profiles/domain/ownership.mjs';
import { ProfileConcept, ProfileStatus, ProfileType, ProfileVisibility } from '../backend/modules/profiles/domain/profile-types.mjs';
import { assertNoProfileSensitiveExposure, ProfileSecurityPolicy } from '../backend/modules/profiles/domain/security-policy.mjs';
import { ProfileVisibilityClass, validateProfileVisibilityExposure } from '../backend/modules/profiles/domain/visibility.mjs';
import { APPROVED_PROFILE_STATUSES, APPROVED_PROFILE_TYPES, APPROVED_PROFILE_VISIBILITIES, validateProfileFoundation } from '../backend/modules/profiles/schemas/profile-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validProfile = Object.freeze({
  profileIdentityRef: 'profile_identity:personal-001',
  profileType: ProfileType.PERSONAL,
  visibility: ProfileVisibility.PUBLIC,
  status: ProfileStatus.CREATED,
  ownershipRef: Object.freeze({ ownerModule: 'users', userAccountRef: 'user_account:user-001' }),
});

test('profile module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/profiles/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('profile concepts stay separate from user account, identity, business, professional, and organization implementations', () => {
  assert.equal(ProfileConcept.PROFILE, 'Profile');
  assert.equal(ProfileConcept.PROFILE_IDENTITY, 'Profile Identity');
  assert.equal(ProfileOwnershipBoundary.USER_ACCOUNT_OWNS_IDENTITY_RELATIONSHIP, 'user_account_owns_identity_relationship');
  assert.equal(ProfileOwnershipBoundary.PROFILE_REPRESENTS_PUBLIC_FACING_IDENTITY_LAYER, 'profile_represents_public_facing_identity_layer');
});

test('profile types are future-compatible references only', () => {
  assert.deepEqual(APPROVED_PROFILE_TYPES, Object.values(ProfileType));
  assert.ok(APPROVED_PROFILE_TYPES.includes(ProfileType.PERSONAL));
  assert.ok(APPROVED_PROFILE_TYPES.includes(ProfileType.PROFESSIONAL));
  assert.ok(APPROVED_PROFILE_TYPES.includes(ProfileType.BUSINESS));
  assert.ok(APPROVED_PROFILE_TYPES.includes(ProfileType.ORGANIZATION));
  assert.ok(APPROVED_PROFILE_TYPES.includes(ProfileType.PARTNER));
  assert.ok(APPROVED_PROFILE_TYPES.includes(ProfileType.REPRESENTATIVE));
});

test('ownership boundaries reject duplicate entity ownership and unauthorized transfer', () => {
  assert.equal(validateProfileOwnershipReference(validProfile.ownershipRef).valid, true);
  assert.equal(ForbiddenProfileOwnershipRule.DUPLICATE_OWNERSHIP, 'duplicate_ownership');
  const invalid = validateProfileOwnershipReference({ ownerModule: 'business_profiles', userAccountRef: 'user_account:user-001', businessEntityRef: 'business:001', transferRequested: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.code === 'PROFILE_OWNERSHIP_INVALID'));
});

test('visibility rules define public, private, and internal classes and prevent private public exposure', () => {
  assert.deepEqual(APPROVED_PROFILE_VISIBILITIES, Object.values(ProfileVisibility));
  assert.ok(ProfileVisibilityClass.public.includes('displayName'));
  assert.ok(ProfileVisibilityClass.private.includes('personalInformationRef'));
  assert.ok(ProfileVisibilityClass.internal.includes('securityMetadataRef'));
  assert.equal(validateProfileVisibilityExposure({ visibility: ProfileVisibility.PUBLIC, fieldClass: ProfileVisibility.PUBLIC }).valid, true);
  assert.equal(validateProfileVisibilityExposure({ visibility: ProfileVisibility.PUBLIC, fieldClass: ProfileVisibility.PRIVATE }).valid, false);
});

test('profile lifecycle compatibility uses Created, Pending, Active, Suspended, and Archived states', () => {
  assert.deepEqual(APPROVED_PROFILE_STATUSES, Object.values(ProfileStatus));
  assert.equal(canTransitionProfileLifecycle(ProfileStatus.CREATED, ProfileStatus.PENDING), true);
  assert.equal(canTransitionProfileLifecycle(ProfileStatus.PENDING, ProfileStatus.ACTIVE), true);
  assert.equal(canTransitionProfileLifecycle(ProfileStatus.ACTIVE, ProfileStatus.SUSPENDED), true);
  assert.equal(canTransitionProfileLifecycle(ProfileStatus.SUSPENDED, ProfileStatus.ACTIVE), true);
  assert.equal(canTransitionProfileLifecycle(ProfileStatus.ACTIVE, ProfileStatus.ARCHIVED), true);
  assert.equal(canTransitionProfileLifecycle(ProfileStatus.ARCHIVED, ProfileStatus.ACTIVE), false);
  assert.equal(validateProfileLifecycleTransition(ProfileStatus.CREATED, ProfileStatus.ACTIVE).valid, false);
});

test('profile validation checks type, status, visibility, ownership reference, and required profile identity reference only', () => {
  assert.equal(validateProfileFoundation(validProfile).valid, true);
  const invalid = validateProfileFoundation({ profileIdentityRef: 'business:001', profileType: 'seller_profile', visibility: 'public', status: 'paid', ownershipRef: { ownerModule: 'organizations' } });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'profileIdentityRef'));
  assert.ok(invalid.errors.some((error) => error.field === 'profileType'));
  assert.ok(invalid.errors.some((error) => error.field === 'ownershipRef.ownerModule'));
});

test('profile foundation remains compatible with identity and users modules by reference only', async () => {
  const readme = await read('backend/modules/profiles/README.md');
  assert.match(readme, /User Account owns the identity relationship/);
  assert.match(readme, /Profile represents the public-facing identity layer/);
  assert.match(readme, /Allowed Dependencies/);
  assert.match(readme, /backend\/modules\/identity/);
  assert.match(readme, /backend\/modules\/users/);
});

test('profile errors are compatible with Mission 052 core errors', () => {
  const invalid = createProfileError(ProfileErrorCode.PROFILE_INVALID, 'Invalid profile.');
  const duplicate = createProfileError(ProfileErrorCode.PROFILE_DUPLICATE, 'Duplicate profile.');
  const ownership = createProfileError(ProfileErrorCode.PROFILE_OWNERSHIP_INVALID, 'Invalid ownership.');
  const lifecycle = createProfileError(ProfileErrorCode.PROFILE_LIFECYCLE_INVALID, 'Invalid lifecycle.');
  assert.ok(invalid instanceof KhedmahCoreError);
  assert.equal(invalid.category, ErrorCategory.VALIDATION);
  assert.equal(duplicate.category, ErrorCategory.DUPLICATE);
  assert.equal(ownership.category, ErrorCategory.OWNERSHIP);
  assert.equal(lifecycle.category, ErrorCategory.LIFECYCLE);
});

test('profile audit events are future-compatible constants only', () => {
  assert.equal(ProfileAuditEvent.PROFILE_CREATED, 'PROFILE_CREATED');
  assert.equal(ProfileAuditEvent.PROFILE_UPDATED, 'PROFILE_UPDATED');
  assert.equal(ProfileAuditEvent.PROFILE_STATUS_CHANGED, 'PROFILE_STATUS_CHANGED');
  assert.equal(ProfileAuditEvent.PROFILE_ARCHIVED, 'PROFILE_ARCHIVED');
  assert.equal(ProfileAuditEvent.PROFILE_OWNERSHIP_CHANGED, 'PROFILE_OWNERSHIP_CHANGED');
  assert.ok(Object.values(ProfileAuditEvent).every(isProfileAuditEventName));
});

test('profile dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/profiles/domain/profile-types.mjs',
    'backend/modules/profiles/domain/ownership.mjs',
    'backend/modules/profiles/domain/visibility.mjs',
    'backend/modules/profiles/domain/lifecycle.mjs',
    'backend/modules/profiles/domain/errors.mjs',
    'backend/modules/profiles/domain/audit-events.mjs',
    'backend/modules/profiles/domain/security-policy.mjs',
    'backend/modules/profiles/schemas/profile-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|business_profiles|professional_profiles|organizations|service_catalog|locations|trust_verification|relationships|analytics|apps\/backend|frontend)/);
  assert.doesNotMatch(content, /controller|route|migration|database connection/i);
});

test('profile security boundaries expose no passwords, tokens, credentials, secrets, or private user data', () => {
  assert.equal(ProfileSecurityPolicy.storesSecretsOrCredentials, false);
  assert.equal(ProfileSecurityPolicy.storesPrivateUserData, false);
  assert.deepEqual(assertNoProfileSensitiveExposure({ profileIdentityRef: 'profile_identity:personal-001' }), { valid: true, exposed: [] });
  assert.equal(assertNoProfileSensitiveExposure({ token: 'never' }).valid, false);
});

test('profile foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/profiles/README.md');
  assert.match(readme, /does not create business marketplace profiles, seller profiles, payment profiles, commission profiles, advertising profiles, social profiles, followers, AI profiles, tracking profiles, or ranking profiles/);
  assert.match(readme, /No workflow engine is implemented/);
});
