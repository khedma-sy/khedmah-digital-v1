import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { ProfessionalProfileAuditEvent, isProfessionalProfileAuditEventName } from '../backend/modules/professional_profiles/domain/audit-events.mjs';
import { createProfessionalProfileError, ProfessionalProfileErrorCode } from '../backend/modules/professional_profiles/domain/errors.mjs';
import { canTransitionProfessionalLifecycle, validateProfessionalLifecycleTransition } from '../backend/modules/professional_profiles/domain/lifecycle.mjs';
import { ForbiddenProfessionalOwnershipRule, ProfessionalOwnershipBoundary, validateProfessionalOwnershipReference } from '../backend/modules/professional_profiles/domain/ownership.mjs';
import { ProfessionType, ProfessionalProfileConcept, ProfessionalStatus, ProfessionalVisibility } from '../backend/modules/professional_profiles/domain/professional-types.mjs';
import { assertNoProfessionalSensitiveExposure, ProfessionalProfileSecurityPolicy } from '../backend/modules/professional_profiles/domain/security-policy.mjs';
import { ProfessionalVisibilityClass, validateProfessionalVisibilityExposure } from '../backend/modules/professional_profiles/domain/visibility.mjs';
import { APPROVED_PROFESSION_TYPES, APPROVED_PROFESSIONAL_STATUSES, APPROVED_PROFESSIONAL_VISIBILITIES, validateProfessionalProfileFoundation } from '../backend/modules/professional_profiles/schemas/professional-profile-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validProfessionalProfile = Object.freeze({
  professionalIdentityRef: 'professional_identity:engineer-001',
  profileRef: 'profile:personal-001',
  professionType: ProfessionType.ENGINEER,
  visibility: ProfessionalVisibility.PUBLIC,
  status: ProfessionalStatus.CREATED,
  ownershipRef: Object.freeze({ ownerModule: 'users', userAccountRef: 'user_account:user-001', profileRef: 'profile:personal-001' }),
});

test('professional profile module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/professional_profiles/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('professional concepts stay separate from user account, profile, business profile, and organization implementations', () => {
  assert.equal(ProfessionalProfileConcept.PROFESSIONAL_PROFILE, 'Professional Profile');
  assert.equal(ProfessionalProfileConcept.PROFESSIONAL_IDENTITY, 'Professional Identity');
  assert.equal(ProfessionalOwnershipBoundary.USER_ACCOUNT_OWNS_IDENTITY_RELATIONSHIP, 'user_account_owns_identity_relationship');
  assert.equal(ProfessionalOwnershipBoundary.PROFILE_REPRESENTS_PUBLIC_IDENTITY_LAYER, 'profile_represents_public_identity_layer');
  assert.equal(ProfessionalOwnershipBoundary.PROFESSIONAL_PROFILE_REPRESENTS_PROFESSIONAL_IDENTITY, 'professional_profile_represents_professional_identity');
});

test('profession types are future-compatible references only', () => {
  assert.deepEqual(APPROVED_PROFESSION_TYPES, Object.values(ProfessionType));
  assert.ok(APPROVED_PROFESSION_TYPES.includes(ProfessionType.DOCTOR));
  assert.ok(APPROVED_PROFESSION_TYPES.includes(ProfessionType.DENTIST));
  assert.ok(APPROVED_PROFESSION_TYPES.includes(ProfessionType.ENGINEER));
  assert.ok(APPROVED_PROFESSION_TYPES.includes(ProfessionType.LAWYER));
  assert.ok(APPROVED_PROFESSION_TYPES.includes(ProfessionType.CONSULTANT));
  assert.ok(APPROVED_PROFESSION_TYPES.includes(ProfessionType.FREELANCER));
  assert.ok(APPROVED_PROFESSION_TYPES.includes(ProfessionType.TECHNICAL_SPECIALIST));
  assert.ok(APPROVED_PROFESSION_TYPES.includes(ProfessionType.OTHER_PROFESSIONAL));
});

test('professional ownership boundaries reject business ownership, organization ownership, duplicate identity, and unauthorized transfer', () => {
  assert.equal(validateProfessionalOwnershipReference(validProfessionalProfile.ownershipRef).valid, true);
  assert.equal(ForbiddenProfessionalOwnershipRule.PROFESSIONAL_PROFILE_AS_BUSINESS_ENTITY, 'professional_profile_as_business_entity');
  assert.equal(ForbiddenProfessionalOwnershipRule.PROFESSIONAL_PROFILE_OWNS_ORGANIZATION, 'professional_profile_owns_organization');
  const invalid = validateProfessionalOwnershipReference({ ownerModule: 'business_profiles', userAccountRef: 'user_account:user-001', profileRef: 'profile:personal-001', businessEntityRef: 'business:001', organizationEntityRef: 'organization:001', duplicateProfessionalIdentity: true, transferRequested: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.code === 'PROFESSIONAL_OWNERSHIP_INVALID'));
});

test('professional visibility rules define public, private, and internal classes and prevent sensitive exposure', () => {
  assert.deepEqual(APPROVED_PROFESSIONAL_VISIBILITIES, Object.values(ProfessionalVisibility));
  assert.ok(ProfessionalVisibilityClass.public.includes('professionalDisplayIdentity'));
  assert.ok(ProfessionalVisibilityClass.public.includes('professionCategoryRef'));
  assert.ok(ProfessionalVisibilityClass.private.includes('privateContactRef'));
  assert.ok(ProfessionalVisibilityClass.internal.includes('operationalMetadataRef'));
  assert.equal(validateProfessionalVisibilityExposure({ visibility: ProfessionalVisibility.PUBLIC, fieldClass: ProfessionalVisibility.PUBLIC }).valid, true);
  assert.equal(validateProfessionalVisibilityExposure({ visibility: ProfessionalVisibility.PUBLIC, fieldClass: ProfessionalVisibility.PRIVATE }).valid, false);
  assert.equal(validateProfessionalVisibilityExposure({ visibility: ProfessionalVisibility.PUBLIC, fieldClass: ProfessionalVisibility.PUBLIC, exposesVerificationData: true }).valid, false);
});

test('professional lifecycle compatibility reuses Created, Pending, Active, Suspended, and Archived profile states', () => {
  assert.deepEqual(APPROVED_PROFESSIONAL_STATUSES, Object.values(ProfessionalStatus));
  assert.equal(canTransitionProfessionalLifecycle(ProfessionalStatus.CREATED, ProfessionalStatus.PENDING), true);
  assert.equal(canTransitionProfessionalLifecycle(ProfessionalStatus.PENDING, ProfessionalStatus.ACTIVE), true);
  assert.equal(canTransitionProfessionalLifecycle(ProfessionalStatus.ACTIVE, ProfessionalStatus.SUSPENDED), true);
  assert.equal(canTransitionProfessionalLifecycle(ProfessionalStatus.SUSPENDED, ProfessionalStatus.ACTIVE), true);
  assert.equal(canTransitionProfessionalLifecycle(ProfessionalStatus.ACTIVE, ProfessionalStatus.ARCHIVED), true);
  assert.equal(canTransitionProfessionalLifecycle(ProfessionalStatus.ARCHIVED, ProfessionalStatus.ACTIVE), false);
  assert.equal(validateProfessionalLifecycleTransition(ProfessionalStatus.CREATED, ProfessionalStatus.ACTIVE).valid, false);
});

test('professional validation checks profession type, status, visibility, ownership, and required identity references only', () => {
  assert.equal(validateProfessionalProfileFoundation(validProfessionalProfile).valid, true);
  const invalid = validateProfessionalProfileFoundation({ professionalIdentityRef: 'license:001', profileRef: 'organization:001', professionType: 'seller', visibility: 'public', status: 'paid', ownershipRef: { ownerModule: 'organizations' } });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'professionalIdentityRef'));
  assert.ok(invalid.errors.some((error) => error.field === 'professionType'));
  assert.ok(invalid.errors.some((error) => error.field === 'ownershipRef.ownerModule'));
});

test('professional profile foundation remains compatible with identity, users, and profiles by reference only', async () => {
  const readme = await read('backend/modules/professional_profiles/README.md');
  assert.match(readme, /User Account owns the identity relationship/);
  assert.match(readme, /Profile represents the public identity layer/);
  assert.match(readme, /Professional Profile represents professional identity/);
  assert.match(readme, /backend\/modules\/identity/);
  assert.match(readme, /backend\/modules\/users/);
  assert.match(readme, /backend\/modules\/profiles/);
});

test('professional profile errors are compatible with Mission 052 core errors', () => {
  const invalid = createProfessionalProfileError(ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_INVALID, 'Invalid professional profile.');
  const duplicate = createProfessionalProfileError(ProfessionalProfileErrorCode.PROFESSIONAL_PROFILE_DUPLICATE, 'Duplicate professional profile.');
  const ownership = createProfessionalProfileError(ProfessionalProfileErrorCode.PROFESSIONAL_OWNERSHIP_INVALID, 'Invalid professional ownership.');
  const lifecycle = createProfessionalProfileError(ProfessionalProfileErrorCode.PROFESSIONAL_LIFECYCLE_INVALID, 'Invalid professional lifecycle.');
  assert.ok(invalid instanceof KhedmahCoreError);
  assert.equal(invalid.category, ErrorCategory.VALIDATION);
  assert.equal(duplicate.category, ErrorCategory.DUPLICATE);
  assert.equal(ownership.category, ErrorCategory.OWNERSHIP);
  assert.equal(lifecycle.category, ErrorCategory.LIFECYCLE);
});

test('professional profile audit events are future-compatible constants only', () => {
  assert.equal(ProfessionalProfileAuditEvent.PROFESSIONAL_PROFILE_CREATED, 'PROFESSIONAL_PROFILE_CREATED');
  assert.equal(ProfessionalProfileAuditEvent.PROFESSIONAL_PROFILE_UPDATED, 'PROFESSIONAL_PROFILE_UPDATED');
  assert.equal(ProfessionalProfileAuditEvent.PROFESSIONAL_PROFILE_STATUS_CHANGED, 'PROFESSIONAL_PROFILE_STATUS_CHANGED');
  assert.equal(ProfessionalProfileAuditEvent.PROFESSIONAL_PROFILE_ARCHIVED, 'PROFESSIONAL_PROFILE_ARCHIVED');
  assert.ok(Object.values(ProfessionalProfileAuditEvent).every(isProfessionalProfileAuditEventName));
});

test('professional profile dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/professional_profiles/domain/professional-types.mjs',
    'backend/modules/professional_profiles/domain/ownership.mjs',
    'backend/modules/professional_profiles/domain/visibility.mjs',
    'backend/modules/professional_profiles/domain/lifecycle.mjs',
    'backend/modules/professional_profiles/domain/errors.mjs',
    'backend/modules/professional_profiles/domain/audit-events.mjs',
    'backend/modules/professional_profiles/domain/security-policy.mjs',
    'backend/modules/professional_profiles/schemas/professional-profile-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|business_profiles|organizations|service_catalog|trust_verification|relationships|analytics|apps\/backend|frontend)/);
  assert.doesNotMatch(content, /controller|route|migration|database connection/i);
});

test('professional profile security boundaries expose no passwords, tokens, credentials, secrets, certificates, or private documents', () => {
  assert.equal(ProfessionalProfileSecurityPolicy.storesSecretsOrCredentials, false);
  assert.equal(ProfessionalProfileSecurityPolicy.storesCertificates, false);
  assert.equal(ProfessionalProfileSecurityPolicy.storesPrivateProfessionalDocuments, false);
  assert.deepEqual(assertNoProfessionalSensitiveExposure({ professionalIdentityRef: 'professional_identity:engineer-001' }), { valid: true, exposed: [] });
  assert.equal(assertNoProfessionalSensitiveExposure({ certificate: 'never' }).valid, false);
});

test('professional profile foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/professional_profiles/README.md');
  assert.match(readme, /does not create professional marketplaces, booking systems, payment accounts, commission systems, advertising profiles, ranking manipulation, social profiles, followers, AI professional scoring, or tracking profiles/);
  assert.match(readme, /No workflow engine is implemented/);
});
