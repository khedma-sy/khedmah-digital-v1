import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { IdentityAuditEvent, isIdentityAuditEventName } from '../backend/modules/identity/domain/audit-events.mjs';
import { createIdentityError, IdentityErrorCode } from '../backend/modules/identity/domain/errors.mjs';
import { AccountStatus, AccountType, IdentityConcept, OWNERSHIP_BOUNDARY_REFERENCES } from '../backend/modules/identity/domain/identity-types.mjs';
import { canTransitionIdentityLifecycle, validateIdentityLifecycleTransition } from '../backend/modules/identity/domain/lifecycle.mjs';
import { assertNoCredentialExposure, IdentitySecurityPolicy } from '../backend/modules/identity/domain/security-policy.mjs';
import { APPROVED_ACCOUNT_TYPES, validateIdentityFoundation } from '../backend/modules/identity/schemas/identity-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('identity module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/identity/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('identity concepts and approved account types are foundation-only constants', () => {
  assert.equal(IdentityConcept.USER_ACCOUNT, 'User Account');
  assert.deepEqual(APPROVED_ACCOUNT_TYPES, Object.values(AccountType));
  assert.ok(APPROVED_ACCOUNT_TYPES.includes(AccountType.INDIVIDUAL_USER));
  assert.ok(APPROVED_ACCOUNT_TYPES.includes(AccountType.PROFESSIONAL_ACCOUNT));
  assert.ok(APPROVED_ACCOUNT_TYPES.includes(AccountType.BUSINESS_ACCOUNT));
  assert.ok(APPROVED_ACCOUNT_TYPES.includes(AccountType.ORGANIZATION_ACCOUNT));
  assert.ok(APPROVED_ACCOUNT_TYPES.includes(AccountType.PARTNER_ACCOUNT));
});

test('identity lifecycle states and transitions enforce Created to Archived rules', () => {
  assert.equal(canTransitionIdentityLifecycle(AccountStatus.CREATED, AccountStatus.PENDING), true);
  assert.equal(canTransitionIdentityLifecycle(AccountStatus.PENDING, AccountStatus.ACTIVE), true);
  assert.equal(canTransitionIdentityLifecycle(AccountStatus.ACTIVE, AccountStatus.SUSPENDED), true);
  assert.equal(canTransitionIdentityLifecycle(AccountStatus.SUSPENDED, AccountStatus.ACTIVE), true);
  assert.equal(canTransitionIdentityLifecycle(AccountStatus.ACTIVE, AccountStatus.ARCHIVED), true);
  assert.equal(canTransitionIdentityLifecycle(AccountStatus.ARCHIVED, AccountStatus.ACTIVE), false);
  assert.equal(validateIdentityLifecycleTransition(AccountStatus.CREATED, AccountStatus.ACTIVE).valid, false);
});

test('identity validation checks required fields, account type, lifecycle status, and identifier format', () => {
  const valid = validateIdentityFoundation({
    identifier: 'user.identity-001',
    accountType: AccountType.INDIVIDUAL_USER,
    status: AccountStatus.CREATED,
    lifecycleState: AccountStatus.CREATED,
  });
  assert.equal(valid.valid, true);

  const invalid = validateIdentityFoundation({ identifier: 'x', accountType: 'seller_account', status: 'paid', lifecycleState: AccountStatus.ACTIVE });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.code === 'INVALID_FORMAT'));
  assert.ok(invalid.errors.some((error) => error.field === 'accountType'));
});

test('identity security boundaries forbid credential exposure and remain policy-only', () => {
  assert.equal(IdentitySecurityPolicy.passwordPolicyRequirements.storePasswordPlaintext, false);
  assert.match(IdentitySecurityPolicy.passwordPolicyRequirements.missionScope, /no_password_storage/);
  assert.deepEqual(assertNoCredentialExposure({ identifier: 'safe-user' }), { valid: true, exposed: [] });
  assert.equal(assertNoCredentialExposure({ password: 'never' }).valid, false);
});

test('identity errors are compatible with Mission 052 core error categories', () => {
  const lifecycle = createIdentityError(IdentityErrorCode.INVALID_LIFECYCLE_TRANSITION, 'Invalid transition.');
  const duplicate = createIdentityError(IdentityErrorCode.DUPLICATE_IDENTITY_CONFLICT, 'Duplicate identity.');
  const forbidden = createIdentityError(IdentityErrorCode.FORBIDDEN_IDENTITY_ACTION, 'Forbidden identity action.');
  assert.ok(lifecycle instanceof KhedmahCoreError);
  assert.equal(lifecycle.category, ErrorCategory.LIFECYCLE);
  assert.equal(duplicate.category, ErrorCategory.DUPLICATE);
  assert.equal(forbidden.category, ErrorCategory.AUTHORIZATION);
});

test('identity audit event names are future audit compatible and uppercase', () => {
  assert.equal(IdentityAuditEvent.USER_ACCOUNT_CREATED, 'USER_ACCOUNT_CREATED');
  assert.equal(IdentityAuditEvent.USER_ACCOUNT_UPDATED, 'USER_ACCOUNT_UPDATED');
  assert.equal(IdentityAuditEvent.ACCOUNT_STATUS_CHANGED, 'ACCOUNT_STATUS_CHANGED');
  assert.equal(IdentityAuditEvent.IDENTITY_VERIFICATION_CHANGED, 'IDENTITY_VERIFICATION_CHANGED');
  assert.ok(Object.values(IdentityAuditEvent).every(isIdentityAuditEventName));
});

test('identity module depends only on core and shared and excludes critical forbidden scopes', async () => {
  const files = [
    'backend/modules/identity/domain/identity-types.mjs',
    'backend/modules/identity/domain/lifecycle.mjs',
    'backend/modules/identity/domain/security-policy.mjs',
    'backend/modules/identity/domain/errors.mjs',
    'backend/modules/identity/domain/audit-events.mjs',
    'backend/modules/identity/schemas/identity-validation.mjs',
    'backend/modules/identity/README.md',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(database|organizations|business_profiles|service_catalog|apps\/backend|frontend)/);
  assert.doesNotMatch(content, /MARKETPLACE_ACCOUNT|SELLER_ACCOUNT|PAYMENT_ACCOUNT|COMMISSION_ACCOUNT|ADVERTISING_ACCOUNT|SOCIAL_PROFILE|FOLLOWER_SYSTEM|AI_PROFILE|TRACKING_PROFILE/);
  assert.match(content, /does not create marketplace accounts, seller accounts, payment accounts, commission accounts, advertising accounts, social profiles, follower systems, AI profiles, tracking profiles/);
  assert.ok(OWNERSHIP_BOUNDARY_REFERENCES.includes('roles_reference_only'));
});
