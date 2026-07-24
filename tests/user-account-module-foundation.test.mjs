import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { AccountStatus, AccountType } from '../backend/modules/identity/domain/identity-types.mjs';
import { canTransitionUserLifecycle, USER_LIFECYCLE_COMPATIBILITY, validateUserLifecycleTransition } from '../backend/modules/users/domain/user-lifecycle.mjs';
import { assertUserPublicPayloadBoundary, UserPrivacyBoundary } from '../backend/modules/users/domain/privacy-policy.mjs';
import { UserAccountAuditEvent, isUserAccountAuditEventName, USER_IDENTITY_AUDIT_COMPATIBILITY } from '../backend/modules/users/domain/user-audit-events.mjs';
import { UserAccountConcept, UserAccountType, USER_ROLE_PERMISSION_REFERENCES, UserVisibilityClassification } from '../backend/modules/users/domain/user-account-types.mjs';
import { createUserAccountError, UserAccountErrorCode, USER_IDENTITY_ERROR_COMPATIBILITY } from '../backend/modules/users/domain/user-errors.mjs';
import { validateUserAccountFoundation } from '../backend/modules/users/schemas/user-account-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('users module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/users/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('user account concepts preserve identity references without database entities', () => {
  assert.equal(UserAccountConcept.USER_ACCOUNT, 'User Account');
  assert.equal(UserAccountConcept.USER_IDENTITY_REFERENCE, 'User Identity Reference');
  assert.equal(UserAccountConcept.ACCOUNT_TYPE_REFERENCE, 'Account Type Reference');
  assert.equal(UserAccountConcept.ACCOUNT_LIFECYCLE_REFERENCE, 'Account Lifecycle Reference');
  assert.deepEqual(UserAccountType, AccountType);
});

test('user account types remain compatible with Mission 053 account types only', () => {
  assert.equal(UserAccountType.INDIVIDUAL_USER, AccountType.INDIVIDUAL_USER);
  assert.equal(UserAccountType.PROFESSIONAL_ACCOUNT, AccountType.PROFESSIONAL_ACCOUNT);
  assert.equal(UserAccountType.BUSINESS_ACCOUNT, AccountType.BUSINESS_ACCOUNT);
  assert.equal(UserAccountType.ORGANIZATION_ACCOUNT, AccountType.ORGANIZATION_ACCOUNT);
  assert.equal(UserAccountType.PARTNER_ACCOUNT, AccountType.PARTNER_ACCOUNT);
});

test('user lifecycle compatibility reuses identity lifecycle references', () => {
  assert.equal(USER_LIFECYCLE_COMPATIBILITY.workflowEngineImplemented, false);
  assert.equal(canTransitionUserLifecycle(AccountStatus.CREATED, AccountStatus.PENDING), true);
  assert.equal(canTransitionUserLifecycle(AccountStatus.PENDING, AccountStatus.ACTIVE), true);
  assert.equal(canTransitionUserLifecycle(AccountStatus.ARCHIVED, AccountStatus.ACTIVE), false);
  assert.equal(validateUserLifecycleTransition(AccountStatus.CREATED, AccountStatus.ACTIVE).valid, false);
});

test('user validation checks references, account type, account status, lifecycle, visibility, and safe identifier', () => {
  const valid = validateUserAccountFoundation({
    userIdentifier: 'user.account-001',
    identityReference: 'identity_user_000001',
    accountType: AccountType.INDIVIDUAL_USER,
    accountStatus: AccountStatus.CREATED,
    lifecycleState: AccountStatus.CREATED,
    visibility: UserVisibilityClassification.PRIVATE,
  });
  assert.equal(valid.valid, true);

  const invalid = validateUserAccountFoundation({
    userIdentifier: 'x',
    identityReference: 'organization_0001',
    accountType: 'delivery_user',
    accountStatus: 'marketplace_active',
    lifecycleState: AccountStatus.ACTIVE,
    visibility: 'external_tracking',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'userIdentifier'));
  assert.ok(invalid.errors.some((error) => error.field === 'identityReference'));
  assert.ok(invalid.errors.some((error) => error.field === 'accountType'));
});

test('user privacy boundaries classify public, private, and internal account data', () => {
  assert.ok(UserPrivacyBoundary.public.includes('display_identity'));
  assert.ok(UserPrivacyBoundary.private.includes('personal_contact_references'));
  assert.ok(UserPrivacyBoundary.internal.includes('security_metadata'));
  assert.deepEqual(assertUserPublicPayloadBoundary({ displayIdentity: 'زائر خدمة', publicProfileReference: 'profile_001' }), { valid: true, exposed: [] });
  assert.equal(assertUserPublicPayloadBoundary({ email: 'private@example.test' }).valid, false);
});

test('user errors use Mission 052 core errors and identity compatibility references', () => {
  const invalid = createUserAccountError(UserAccountErrorCode.USER_ACCOUNT_INVALID, 'Invalid user account.');
  const duplicate = createUserAccountError(UserAccountErrorCode.USER_ACCOUNT_DUPLICATE, 'Duplicate user account.');
  const forbidden = createUserAccountError(UserAccountErrorCode.USER_ACCOUNT_FORBIDDEN, 'Forbidden user account action.');
  const lifecycle = createUserAccountError(UserAccountErrorCode.USER_ACCOUNT_LIFECYCLE_INVALID, 'Invalid user lifecycle.');
  assert.ok(invalid instanceof KhedmahCoreError);
  assert.equal(invalid.category, ErrorCategory.VALIDATION);
  assert.equal(duplicate.category, ErrorCategory.DUPLICATE);
  assert.equal(forbidden.category, ErrorCategory.AUTHORIZATION);
  assert.equal(lifecycle.category, ErrorCategory.LIFECYCLE);
  assert.equal(USER_IDENTITY_ERROR_COMPATIBILITY.invalidLifecycleTransition, 'INVALID_LIFECYCLE_TRANSITION');
});

test('user audit event names are future audit compatible and identity compatible', () => {
  assert.equal(UserAccountAuditEvent.USER_ACCOUNT_CREATED, 'USER_ACCOUNT_CREATED');
  assert.equal(UserAccountAuditEvent.USER_ACCOUNT_UPDATED, 'USER_ACCOUNT_UPDATED');
  assert.equal(UserAccountAuditEvent.USER_ACCOUNT_STATUS_CHANGED, 'USER_ACCOUNT_STATUS_CHANGED');
  assert.equal(UserAccountAuditEvent.USER_ACCOUNT_ARCHIVED, 'USER_ACCOUNT_ARCHIVED');
  assert.ok(Object.values(UserAccountAuditEvent).every(isUserAccountAuditEventName));
  assert.equal(USER_IDENTITY_AUDIT_COMPATIBILITY.accountStatusChanged, 'ACCOUNT_STATUS_CHANGED');
});

test('user module dependency restrictions and KILL CRITICAL exclusions are preserved', async () => {
  const files = [
    'backend/modules/users/domain/user-account-types.mjs',
    'backend/modules/users/domain/user-lifecycle.mjs',
    'backend/modules/users/domain/privacy-policy.mjs',
    'backend/modules/users/domain/user-errors.mjs',
    'backend/modules/users/domain/user-audit-events.mjs',
    'backend/modules/users/schemas/user-account-validation.mjs',
    'backend/modules/users/README.md',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|business_profiles|organizations|service_catalog|trust_verification|relationships|frontend)/);
  assert.doesNotMatch(content, /SELLER_ACCOUNT|PAYMENT_ACCOUNT|COMMISSION_ACCOUNT|ADVERTISING_ACCOUNT|SOCIAL_PROFILE|FOLLOWER|AI_PROFILE|TRACKING_PROFILE|MARKETPLACE_USER|DELIVERY_USER/);
  assert.match(content, /does not create seller accounts, payment accounts, commission accounts, advertising accounts, social profiles, followers, AI profiles, tracking profiles, marketplace users, delivery users/);
  assert.ok(USER_ROLE_PERMISSION_REFERENCES.includes('roles_reference_only'));
});
