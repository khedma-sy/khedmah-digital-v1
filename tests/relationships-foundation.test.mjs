import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { RelationshipAuditEvent, isRelationshipAuditEventName } from '../backend/modules/relationships/domain/audit-events.mjs';
import { createRelationshipError, RelationshipErrorCode } from '../backend/modules/relationships/domain/errors.mjs';
import { canTransitionRelationshipLifecycle, validateRelationshipLifecycleTransition } from '../backend/modules/relationships/domain/lifecycle.mjs';
import { ForbiddenRelationshipOwnershipRule, RelationshipOwnershipBoundary, validateRelationshipOwnershipBoundary } from '../backend/modules/relationships/domain/ownership.mjs';
import { RelationshipSecurityPolicy, assertNoRelationshipSensitiveExposure } from '../backend/modules/relationships/domain/security-policy.mjs';
import { RelationshipConcept, RelationshipEntityReferenceType, RelationshipScope, RelationshipStatus, RelationshipType, RelationshipVisibility } from '../backend/modules/relationships/domain/relationship-types.mjs';
import { RelationshipVisibilityClass, validateRelationshipVisibilityExposure } from '../backend/modules/relationships/domain/visibility.mjs';
import { APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES, APPROVED_RELATIONSHIP_SCOPES, APPROVED_RELATIONSHIP_STATUSES, APPROVED_RELATIONSHIP_TYPES, APPROVED_RELATIONSHIP_VISIBILITIES, validateRelationshipFoundation, validateRelationshipReferencePair } from '../backend/modules/relationships/schemas/relationship-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validRelationship = Object.freeze({
  relationshipRecordRef: 'relationship_record:user-profile-001',
  relationshipType: RelationshipType.USER_PROFILE,
  relationshipStatus: RelationshipStatus.CREATED,
  subjectRef: 'user_account:user-001',
  subjectType: RelationshipEntityReferenceType.USER_ACCOUNT,
  targetRef: 'profile:profile-001',
  targetType: RelationshipEntityReferenceType.PROFILE,
  relationshipScope: RelationshipScope.IDENTITY_REFERENCE,
  visibility: RelationshipVisibility.PRIVATE,
  ownershipRef: 'ownership_reference:user-profile-001',
});

test('relationships module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/relationships/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('relationship concepts define record type status subject target scope and ownership references', () => {
  assert.equal(RelationshipConcept.RELATIONSHIP_RECORD, 'Relationship Record');
  assert.equal(RelationshipConcept.RELATIONSHIP_TYPE, 'Relationship Type');
  assert.equal(RelationshipConcept.RELATIONSHIP_SUBJECT, 'Relationship Subject');
  assert.equal(RelationshipConcept.RELATIONSHIP_TARGET, 'Relationship Target');
  assert.equal(RelationshipConcept.OWNERSHIP_REFERENCE, 'Ownership Reference');
});

test('relationship entity reference types include approved future references only', () => {
  assert.deepEqual(APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES, Object.values(RelationshipEntityReferenceType));
  assert.ok(APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES.includes(RelationshipEntityReferenceType.USER_ACCOUNT));
  assert.ok(APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES.includes(RelationshipEntityReferenceType.PROFILE));
  assert.ok(APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES.includes(RelationshipEntityReferenceType.PROFESSIONAL_PROFILE));
  assert.ok(APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES.includes(RelationshipEntityReferenceType.BUSINESS_PROFILE));
  assert.ok(APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES.includes(RelationshipEntityReferenceType.ORGANIZATION));
  assert.ok(APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES.includes(RelationshipEntityReferenceType.PARTNER));
  assert.ok(APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES.includes(RelationshipEntityReferenceType.REPRESENTATIVE));
  assert.ok(APPROVED_RELATIONSHIP_ENTITY_REFERENCE_TYPES.includes(RelationshipEntityReferenceType.SERVICE_PROVIDER_REFERENCE));
});

test('relationship types are reference-only and do not assign permissions or access control', () => {
  assert.deepEqual(APPROVED_RELATIONSHIP_TYPES, Object.values(RelationshipType));
  assert.ok(APPROVED_RELATIONSHIP_TYPES.includes(RelationshipType.USER_PROFILE));
  assert.ok(APPROVED_RELATIONSHIP_TYPES.includes(RelationshipType.BUSINESS_OWNER));
  assert.ok(APPROVED_RELATIONSHIP_TYPES.includes(RelationshipType.PROFESSIONAL_OWNER));
  assert.ok(APPROVED_RELATIONSHIP_TYPES.includes(RelationshipType.ORGANIZATION_MEMBER));
  assert.ok(APPROVED_RELATIONSHIP_TYPES.includes(RelationshipType.PARTNER_RELATIONSHIP));
  assert.ok(APPROVED_RELATIONSHIP_TYPES.includes(RelationshipType.REPRESENTATIVE_RELATIONSHIP));
  assert.ok(APPROVED_RELATIONSHIP_TYPES.includes(RelationshipType.SERVICE_PROVIDER_REFERENCE));
});

test('ownership boundaries keep relationships as connectors only', () => {
  assert.equal(validateRelationshipOwnershipBoundary(validRelationship).valid, true);
  assert.equal(RelationshipOwnershipBoundary.USER_ACCOUNT_OWNS_IDENTITY, 'user_account_owns_identity');
  assert.equal(RelationshipOwnershipBoundary.RELATIONSHIP_CONNECTS_REFERENCES_ONLY, 'relationship_connects_references_only');
  assert.equal(ForbiddenRelationshipOwnershipRule.RELATIONSHIP_OWNS_ENTITY, 'relationship_owns_entity');
  assert.equal(ForbiddenRelationshipOwnershipRule.MARKETPLACE_OWNERSHIP, 'marketplace_ownership');
});

test('validation rules reject invalid references self conflicts duplicates circular ownership and unauthorized transfers', () => {
  assert.equal(validateRelationshipFoundation(validRelationship).valid, true);
  assert.equal(validateRelationshipReferencePair(validRelationship).valid, true);
  const invalid = validateRelationshipFoundation({ relationshipRecordRef: 'relationship:001', relationshipType: 'MARKETPLACE_SELLER', relationshipStatus: 'paid', subjectRef: 'profile:same-001', subjectType: 'marketplace', targetRef: 'profile:same-001', targetType: 'seller', relationshipScope: 'payment_scope', visibility: 'public', ownershipRef: 'owner:001', relationshipOwnsEntity: true, duplicateOwnershipReference: true, circularOwnership: true, transferRequested: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'subjectType'));
  assert.ok(invalid.errors.some((error) => error.field === 'targetType'));
  assert.ok(invalid.errors.some((error) => error.code === 'RELATIONSHIP_DUPLICATE'));
  assert.ok(invalid.errors.some((error) => error.field === 'ownershipRef.transferAuthorized'));
});

test('lifecycle compatibility reuses Created Pending Active Suspended Archived with forbidden transitions', () => {
  assert.deepEqual(APPROVED_RELATIONSHIP_STATUSES, Object.values(RelationshipStatus));
  assert.equal(canTransitionRelationshipLifecycle(RelationshipStatus.CREATED, RelationshipStatus.PENDING), true);
  assert.equal(canTransitionRelationshipLifecycle(RelationshipStatus.PENDING, RelationshipStatus.ACTIVE), true);
  assert.equal(canTransitionRelationshipLifecycle(RelationshipStatus.ACTIVE, RelationshipStatus.SUSPENDED), true);
  assert.equal(canTransitionRelationshipLifecycle(RelationshipStatus.SUSPENDED, RelationshipStatus.ACTIVE), true);
  assert.equal(canTransitionRelationshipLifecycle(RelationshipStatus.ACTIVE, RelationshipStatus.ARCHIVED), true);
  assert.equal(canTransitionRelationshipLifecycle(RelationshipStatus.ARCHIVED, RelationshipStatus.ACTIVE), false);
  assert.equal(validateRelationshipLifecycleTransition(RelationshipStatus.CREATED, RelationshipStatus.ACTIVE).valid, false);
});

test('visibility rules define public existence private ownership/member refs and internal metadata', () => {
  assert.deepEqual(APPROVED_RELATIONSHIP_VISIBILITIES, Object.values(RelationshipVisibility));
  assert.deepEqual(APPROVED_RELATIONSHIP_SCOPES, Object.values(RelationshipScope));
  assert.ok(RelationshipVisibilityClass.public.includes('relationshipExistenceRef'));
  assert.ok(RelationshipVisibilityClass.private.includes('ownershipRef'));
  assert.ok(RelationshipVisibilityClass.private.includes('memberRef'));
  assert.ok(RelationshipVisibilityClass.internal.includes('operationalMetadataRef'));
  assert.equal(validateRelationshipVisibilityExposure({ visibility: RelationshipVisibility.PUBLIC, fieldClass: RelationshipVisibility.PUBLIC }).valid, true);
  assert.equal(validateRelationshipVisibilityExposure({ visibility: RelationshipVisibility.PUBLIC, fieldClass: RelationshipVisibility.PRIVATE }).valid, false);
  assert.equal(validateRelationshipVisibilityExposure({ visibility: RelationshipVisibility.PUBLIC, exposesPrivateRelationship: true }).valid, false);
});

test('relationship errors are compatible with Mission 052 core errors', () => {
  const invalid = createRelationshipError(RelationshipErrorCode.RELATIONSHIP_INVALID, 'Invalid relationship.');
  const duplicate = createRelationshipError(RelationshipErrorCode.RELATIONSHIP_DUPLICATE, 'Duplicate relationship.');
  const type = createRelationshipError(RelationshipErrorCode.RELATIONSHIP_TYPE_INVALID, 'Invalid relationship type.');
  const ownership = createRelationshipError(RelationshipErrorCode.RELATIONSHIP_OWNERSHIP_INVALID, 'Invalid relationship ownership.');
  const lifecycle = createRelationshipError(RelationshipErrorCode.RELATIONSHIP_LIFECYCLE_INVALID, 'Invalid relationship lifecycle.');
  assert.ok(invalid instanceof KhedmahCoreError);
  assert.equal(invalid.category, ErrorCategory.VALIDATION);
  assert.equal(duplicate.category, ErrorCategory.DUPLICATE);
  assert.equal(type.category, ErrorCategory.VALIDATION);
  assert.equal(ownership.category, ErrorCategory.OWNERSHIP);
  assert.equal(lifecycle.category, ErrorCategory.LIFECYCLE);
});

test('audit compatibility defines future event constants only', () => {
  assert.equal(RelationshipAuditEvent.RELATIONSHIP_CREATED, 'RELATIONSHIP_CREATED');
  assert.equal(RelationshipAuditEvent.RELATIONSHIP_UPDATED, 'RELATIONSHIP_UPDATED');
  assert.equal(RelationshipAuditEvent.RELATIONSHIP_STATUS_CHANGED, 'RELATIONSHIP_STATUS_CHANGED');
  assert.equal(RelationshipAuditEvent.OWNERSHIP_REFERENCE_CHANGED, 'OWNERSHIP_REFERENCE_CHANGED');
  assert.equal(RelationshipAuditEvent.RELATIONSHIP_ARCHIVED, 'RELATIONSHIP_ARCHIVED');
  assert.ok(Object.values(RelationshipAuditEvent).every(isRelationshipAuditEventName));
});

test('dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/relationships/domain/relationship-types.mjs',
    'backend/modules/relationships/domain/ownership.mjs',
    'backend/modules/relationships/domain/visibility.mjs',
    'backend/modules/relationships/domain/lifecycle.mjs',
    'backend/modules/relationships/domain/errors.mjs',
    'backend/modules/relationships/domain/audit-events.mjs',
    'backend/modules/relationships/domain/security-policy.mjs',
    'backend/modules/relationships/schemas/relationship-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|frontend|payments|marketplace|analytics|ai_systems|tracking_systems|apps\/backend)/i);
  assert.doesNotMatch(content, /controller|route|migration|ORM model|database connection|authorization middleware|permission enforcement|workflow execution/i);
});

test('security boundaries prevent leakage unauthorized changes sensitive exposure and hidden conflicts', () => {
  assert.equal(RelationshipSecurityPolicy.preventsPrivateOwnershipLeakage, true);
  assert.equal(RelationshipSecurityPolicy.preventsUnauthorizedRelationshipChanges, true);
  assert.equal(RelationshipSecurityPolicy.preventsSensitiveIdentityExposure, true);
  assert.equal(RelationshipSecurityPolicy.preventsHiddenOwnershipConflicts, true);
  assert.equal(RelationshipSecurityPolicy.storesPasswordsTokensCredentialsSecrets, false);
  assert.equal(RelationshipSecurityPolicy.storesPrivateUserData, false);
  assert.deepEqual(assertNoRelationshipSensitiveExposure({ relationshipRecordRef: 'relationship_record:001' }), { valid: true, exposed: [] });
  assert.equal(assertNoRelationshipSensitiveExposure({ passwordHash: 'never', accessToken: 'never', credentialRef: 'never', privateUserDataRef: 'never' }).valid, false);
});

test('relationship foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/relationships/README.md');
  assert.match(readme, /marketplace relationships/);
  assert.match(readme, /seller ownership/);
  assert.match(readme, /payment ownership/);
  assert.match(readme, /commission ownership/);
  assert.match(readme, /advertising ownership/);
  assert.match(readme, /social followers/);
  assert.match(readme, /friendship graph/);
  assert.match(readme, /AI relationship scoring/);
  assert.match(readme, /tracking graph/);
  assert.match(readme, /recommendation graph/);
});
