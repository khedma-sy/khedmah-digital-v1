import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { TrustVerificationAuditEvent, isTrustVerificationAuditEventName } from '../backend/modules/trust_verification/domain/audit-events.mjs';
import { createTrustVerificationError, TrustVerificationErrorCode } from '../backend/modules/trust_verification/domain/errors.mjs';
import { canTransitionTrustStatus, validateTrustLifecycleTransition } from '../backend/modules/trust_verification/domain/lifecycle.mjs';
import { ForbiddenTrustOwnershipRule, TrustOwnershipBoundary, validateTrustOwnershipBoundary } from '../backend/modules/trust_verification/domain/ownership.mjs';
import { TrustVerificationSecurityPolicy, assertNoTrustSensitiveExposure } from '../backend/modules/trust_verification/domain/security-policy.mjs';
import { TrustSubjectBoundary, validateTrustSubjectReference } from '../backend/modules/trust_verification/domain/subjects.mjs';
import { TrustConcept, TrustLevelReference, TrustStatus, TrustSubjectType, TrustVisibility, VerificationStatus, VerificationType } from '../backend/modules/trust_verification/domain/trust-types.mjs';
import { TrustVisibilityClass, validateTrustVisibilityExposure } from '../backend/modules/trust_verification/domain/visibility.mjs';
import { APPROVED_TRUST_LEVEL_REFERENCES, APPROVED_TRUST_STATUSES, APPROVED_TRUST_SUBJECT_TYPES, APPROVED_TRUST_VISIBILITIES, APPROVED_VERIFICATION_STATUSES, APPROVED_VERIFICATION_TYPES, validateTrustStatusCompatibility, validateTrustVerificationFoundation } from '../backend/modules/trust_verification/schemas/trust-verification-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validTrustRecord = Object.freeze({
  trustRecordRef: 'trust_record:profile-001',
  verificationRef: 'verification_ref:identity-001',
  subjectRef: 'user_profile:profile-001',
  subjectType: TrustSubjectType.USER_PROFILE,
  verificationType: VerificationType.IDENTITY_VERIFICATION,
  trustStatus: TrustStatus.PENDING,
  verificationStatus: VerificationStatus.PENDING,
  trustLevelRef: TrustLevelReference.BASIC_REFERENCE,
  visibility: TrustVisibility.PUBLIC,
});

test('trust verification module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/trust_verification/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('trust concepts define references and statuses only', () => {
  assert.equal(TrustConcept.TRUST_RECORD, 'Trust Record');
  assert.equal(TrustConcept.VERIFICATION_REFERENCE, 'Verification Reference');
  assert.equal(TrustConcept.TRUST_SUBJECT_REFERENCE, 'Trust Subject Reference');
  assert.equal(TrustConcept.TRUST_LEVEL_REFERENCE, 'Trust Level Reference');
});

test('trust subject references support approved profile subjects only', () => {
  assert.deepEqual(APPROVED_TRUST_SUBJECT_TYPES, Object.values(TrustSubjectType));
  assert.ok(APPROVED_TRUST_SUBJECT_TYPES.includes(TrustSubjectType.USER_PROFILE));
  assert.ok(APPROVED_TRUST_SUBJECT_TYPES.includes(TrustSubjectType.PROFESSIONAL_PROFILE));
  assert.ok(APPROVED_TRUST_SUBJECT_TYPES.includes(TrustSubjectType.BUSINESS_PROFILE));
  assert.ok(APPROVED_TRUST_SUBJECT_TYPES.includes(TrustSubjectType.ORGANIZATION_PROFILE));
  assert.ok(APPROVED_TRUST_SUBJECT_TYPES.includes(TrustSubjectType.PARTNER_PROFILE));
  assert.equal(TrustSubjectBoundary.USER_PROFILE_REFERENCE_ONLY, 'user_profile_reference_only');
  assert.equal(validateTrustSubjectReference({ subjectType: TrustSubjectType.USER_PROFILE, subjectRef: 'user_profile:001' }).valid, true);
  assert.equal(validateTrustSubjectReference({ subjectType: 'service', subjectRef: 'service:001', ownsService: true }).valid, false);
});

test('verification types are future-compatible constants only', () => {
  assert.deepEqual(APPROVED_VERIFICATION_TYPES, Object.values(VerificationType));
  assert.ok(APPROVED_VERIFICATION_TYPES.includes(VerificationType.IDENTITY_VERIFICATION));
  assert.ok(APPROVED_VERIFICATION_TYPES.includes(VerificationType.BUSINESS_VERIFICATION));
  assert.ok(APPROVED_VERIFICATION_TYPES.includes(VerificationType.PROFESSIONAL_VERIFICATION));
  assert.ok(APPROVED_VERIFICATION_TYPES.includes(VerificationType.ORGANIZATION_VERIFICATION));
});

test('trust and verification statuses support Unknown Pending Verified Rejected Suspended Expired', () => {
  assert.deepEqual(APPROVED_TRUST_STATUSES, Object.values(TrustStatus));
  assert.deepEqual(APPROVED_VERIFICATION_STATUSES, Object.values(VerificationStatus));
  assert.ok(APPROVED_TRUST_STATUSES.includes(TrustStatus.UNKNOWN));
  assert.ok(APPROVED_TRUST_STATUSES.includes(TrustStatus.PENDING));
  assert.ok(APPROVED_TRUST_STATUSES.includes(TrustStatus.VERIFIED));
  assert.ok(APPROVED_TRUST_STATUSES.includes(TrustStatus.REJECTED));
  assert.ok(APPROVED_TRUST_STATUSES.includes(TrustStatus.SUSPENDED));
  assert.ok(APPROVED_TRUST_STATUSES.includes(TrustStatus.EXPIRED));
});

test('trust lifecycle compatibility defines status transitions without workflow execution', () => {
  assert.equal(canTransitionTrustStatus(TrustStatus.UNKNOWN, TrustStatus.PENDING), true);
  assert.equal(canTransitionTrustStatus(TrustStatus.PENDING, TrustStatus.VERIFIED), true);
  assert.equal(canTransitionTrustStatus(TrustStatus.VERIFIED, TrustStatus.SUSPENDED), true);
  assert.equal(canTransitionTrustStatus(TrustStatus.SUSPENDED, TrustStatus.EXPIRED), true);
  assert.equal(canTransitionTrustStatus(TrustStatus.VERIFIED, TrustStatus.REJECTED), false);
  assert.equal(validateTrustLifecycleTransition(TrustStatus.VERIFIED, TrustStatus.REJECTED).valid, false);
  assert.equal(validateTrustStatusCompatibility(TrustStatus.EXPIRED, TrustStatus.PENDING).valid, true);
});

test('visibility rules expose only public status and trust level references', () => {
  assert.deepEqual(APPROVED_TRUST_VISIBILITIES, Object.values(TrustVisibility));
  assert.deepEqual(APPROVED_TRUST_LEVEL_REFERENCES, Object.values(TrustLevelReference));
  assert.ok(TrustVisibilityClass.public.includes('verificationStatusRef'));
  assert.ok(TrustVisibilityClass.public.includes('trustLevelRef'));
  assert.ok(TrustVisibilityClass.private.includes('privateEvidenceRef'));
  assert.ok(TrustVisibilityClass.internal.includes('moderationMetadataRef'));
  assert.equal(validateTrustVisibilityExposure({ visibility: TrustVisibility.PUBLIC, fieldClass: TrustVisibility.PUBLIC }).valid, true);
  assert.equal(validateTrustVisibilityExposure({ visibility: TrustVisibility.PUBLIC, fieldClass: TrustVisibility.PRIVATE }).valid, false);
  assert.equal(validateTrustVisibilityExposure({ visibility: TrustVisibility.PUBLIC, exposesInternalData: true }).valid, false);
});

test('ownership boundaries prevent paid trust ranking and advertising advantages', () => {
  assert.equal(validateTrustOwnershipBoundary(validTrustRecord).valid, true);
  assert.equal(TrustOwnershipBoundary.TRUST_REFERENCES_SUBJECTS_ONLY, 'trust_references_subjects_only');
  assert.equal(ForbiddenTrustOwnershipRule.PAID_TRUST, 'paid_trust');
  const invalid = validateTrustOwnershipBoundary({ trustOwnerRef: 'trust:owner', trustOwnsSubject: true, paidTrustRef: 'payment:001', paymentVerificationRef: 'payment_verification:001', rankingAdvantageRef: 'ranking:boost', advertisingAdvantageRef: 'ad:boost' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.code === 'TRUST_SUBJECT_INVALID'));
  assert.ok(invalid.errors.some((error) => error.code === 'TRUST_INVALID'));
});

test('validation checks subject verification statuses visibility and lifecycle-compatible references only', () => {
  assert.equal(validateTrustVerificationFoundation(validTrustRecord).valid, true);
  const invalid = validateTrustVerificationFoundation({ trustRecordRef: 'trust:001', verificationRef: 'verification:001', subjectRef: 'service:001', subjectType: 'service', verificationType: 'document_upload', trustStatus: 'paid_verified', verificationStatus: 'badge_granted', trustLevelRef: 'ranking:boost', visibility: 'public', paidTrustRef: 'payment:001' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'trustRecordRef'));
  assert.ok(invalid.errors.some((error) => error.field === 'subjectType'));
  assert.ok(invalid.errors.some((error) => error.field === 'verificationType'));
  assert.ok(invalid.errors.some((error) => error.code === 'TRUST_INVALID'));
});

test('trust verification errors are compatible with Mission 052 core errors', () => {
  const trust = createTrustVerificationError(TrustVerificationErrorCode.TRUST_INVALID, 'Invalid trust record.');
  const verification = createTrustVerificationError(TrustVerificationErrorCode.VERIFICATION_INVALID, 'Invalid verification reference.');
  const status = createTrustVerificationError(TrustVerificationErrorCode.TRUST_STATUS_INVALID, 'Invalid trust status.');
  const subject = createTrustVerificationError(TrustVerificationErrorCode.TRUST_SUBJECT_INVALID, 'Invalid trust subject.');
  const visibility = createTrustVerificationError(TrustVerificationErrorCode.TRUST_VISIBILITY_INVALID, 'Invalid trust visibility.');
  assert.ok(trust instanceof KhedmahCoreError);
  assert.equal(trust.category, ErrorCategory.VALIDATION);
  assert.equal(verification.category, ErrorCategory.VALIDATION);
  assert.equal(status.category, ErrorCategory.LIFECYCLE);
  assert.equal(subject.category, ErrorCategory.RELATIONSHIP);
  assert.equal(visibility.category, ErrorCategory.AUTHORIZATION);
});

test('audit compatibility defines future event constants only', () => {
  assert.equal(TrustVerificationAuditEvent.TRUST_CREATED, 'TRUST_CREATED');
  assert.equal(TrustVerificationAuditEvent.TRUST_UPDATED, 'TRUST_UPDATED');
  assert.equal(TrustVerificationAuditEvent.VERIFICATION_STATUS_CHANGED, 'VERIFICATION_STATUS_CHANGED');
  assert.equal(TrustVerificationAuditEvent.TRUST_SUSPENDED, 'TRUST_SUSPENDED');
  assert.equal(TrustVerificationAuditEvent.TRUST_EXPIRED, 'TRUST_EXPIRED');
  assert.ok(Object.values(TrustVerificationAuditEvent).every(isTrustVerificationAuditEventName));
});

test('dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/trust_verification/domain/trust-types.mjs',
    'backend/modules/trust_verification/domain/subjects.mjs',
    'backend/modules/trust_verification/domain/ownership.mjs',
    'backend/modules/trust_verification/domain/visibility.mjs',
    'backend/modules/trust_verification/domain/lifecycle.mjs',
    'backend/modules/trust_verification/domain/errors.mjs',
    'backend/modules/trust_verification/domain/audit-events.mjs',
    'backend/modules/trust_verification/domain/security-policy.mjs',
    'backend/modules/trust_verification/schemas/trust-verification-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|business_profiles|professional_profiles|organizations|service_catalog|locations|relationships|analytics|payments|marketplace|frontend|apps\/backend)/);
  assert.doesNotMatch(content, /controller|route|migration|ORM model|database connection|document storage|certificate storage/i);
});

test('security boundaries expose no identity documents certificates passwords tokens secrets or private evidence', () => {
  assert.equal(TrustVerificationSecurityPolicy.storesIdentityDocuments, false);
  assert.equal(TrustVerificationSecurityPolicy.storesCertificates, false);
  assert.equal(TrustVerificationSecurityPolicy.storesPasswordsTokensOrSecrets, false);
  assert.equal(TrustVerificationSecurityPolicy.storesPrivateEvidence, false);
  assert.deepEqual(assertNoTrustSensitiveExposure({ trustRecordRef: 'trust_record:001' }), { valid: true, exposed: [] });
  assert.equal(assertNoTrustSensitiveExposure({ identityDocumentRef: 'never', certificateRef: 'never', accessToken: 'never', privateEvidenceRef: 'never' }).valid, false);
});

test('trust verification foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/trust_verification/README.md');
  assert.match(readme, /rating system/);
  assert.match(readme, /review system/);
  assert.match(readme, /reputation marketplace/);
  assert.match(readme, /paid verification/);
  assert.match(readme, /ranking boost/);
  assert.match(readme, /advertising advantage/);
  assert.match(readme, /AI trust scoring/);
  assert.match(readme, /social reputation graph/);
  assert.match(readme, /surveillance system/);
});
