import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { AuditEvent, isAuditEventName } from '../backend/modules/audit/domain/audit-events.mjs';
import { AuditAction, AuditConcept, AuditResult } from '../backend/modules/audit/domain/audit-types.mjs';
import { AuditMetadataRule, validateAuditMetadataSafety } from '../backend/modules/audit/domain/metadata-policy.mjs';
import { AuditSecurityPolicy } from '../backend/modules/audit/domain/security-policy.mjs';
import { AuditVisibility, AuditVisibilityRule, validateAuditVisibilityExposure } from '../backend/modules/audit/domain/visibility.mjs';
import { APPROVED_AUDIT_ACTIONS, APPROVED_AUDIT_EVENTS, APPROVED_AUDIT_RESULTS, validateAuditEventName, validateAuditFoundation, validateAuditMetadata } from '../backend/modules/audit/schemas/audit-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validAuditRecord = Object.freeze({
  eventName: AuditEvent.USER_ACCOUNT_CREATED,
  actorRef: 'user_account:user-001',
  action: AuditAction.CREATE,
  resourceRef: 'user_account:user-001',
  result: AuditResult.SUCCESS,
  metadata: Object.freeze({
    previousStateRef: 'system:empty-state',
    newStateRef: 'user_account:user-001',
    timestamp: '2026-07-24T00:00:00.000Z',
    reason: 'account creation reference',
  }),
});

test('audit module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/audit/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('audit domain concepts define reference event actor action resource result and metadata foundations', () => {
  assert.equal(AuditConcept.AUDIT_RECORD_REFERENCE, 'Audit Record Reference');
  assert.equal(AuditConcept.AUDIT_EVENT, 'Audit Event');
  assert.equal(AuditConcept.AUDIT_ACTOR_REFERENCE, 'Audit Actor Reference');
  assert.equal(AuditConcept.AUDIT_ACTION, 'Audit Action');
  assert.equal(AuditConcept.AUDIT_RESOURCE_REFERENCE, 'Audit Resource Reference');
  assert.equal(AuditConcept.AUDIT_RESULT, 'Audit Result');
  assert.equal(AuditConcept.AUDIT_METADATA, 'Audit Metadata');
});

test('audit event naming rules use approved uppercase snake case resource action constants', () => {
  assert.deepEqual(APPROVED_AUDIT_EVENTS, Object.values(AuditEvent));
  for (const eventName of Object.values(AuditEvent)) {
    assert.match(eventName, /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/);
    assert.equal(isAuditEventName(eventName), true);
    assert.equal(validateAuditEventName(eventName).valid, true);
  }
  assert.equal(validateAuditEventName('CREATED').valid, false);
  assert.equal(validateAuditEventName('user.created').valid, false);
});

test('audit event catalog covers completed V1 foundations without ambiguous names', () => {
  assert.equal(AuditEvent.USER_ACCOUNT_CREATED, 'USER_ACCOUNT_CREATED');
  assert.equal(AuditEvent.USER_ACCOUNT_UPDATED, 'USER_ACCOUNT_UPDATED');
  assert.equal(AuditEvent.USER_ACCOUNT_STATUS_CHANGED, 'USER_ACCOUNT_STATUS_CHANGED');
  assert.equal(AuditEvent.PROFILE_CREATED, 'PROFILE_CREATED');
  assert.equal(AuditEvent.BUSINESS_PROFILE_CREATED, 'BUSINESS_PROFILE_CREATED');
  assert.equal(AuditEvent.PROFESSIONAL_PROFILE_CREATED, 'PROFESSIONAL_PROFILE_CREATED');
  assert.equal(AuditEvent.ORGANIZATION_CREATED, 'ORGANIZATION_CREATED');
  assert.equal(AuditEvent.SERVICE_CREATED, 'SERVICE_CREATED');
  assert.equal(AuditEvent.LOCATION_CREATED, 'LOCATION_CREATED');
  assert.equal(AuditEvent.TRUST_CREATED, 'TRUST_CREATED');
  assert.equal(AuditEvent.RELATIONSHIP_CREATED, 'RELATIONSHIP_CREATED');
});

test('audit metadata rules require references timestamp and reason while preventing sensitive payloads', () => {
  assert.equal(AuditMetadataRule.includesActorReference, true);
  assert.equal(AuditMetadataRule.includesAction, true);
  assert.equal(AuditMetadataRule.includesResourceReference, true);
  assert.equal(AuditMetadataRule.includesPreviousStateReference, true);
  assert.equal(AuditMetadataRule.includesNewStateReference, true);
  assert.equal(AuditMetadataRule.includesTimestamp, true);
  assert.equal(AuditMetadataRule.includesReason, true);
  assert.equal(AuditMetadataRule.storesPasswordsTokensSecretsCredentials, false);
  assert.equal(AuditMetadataRule.storesPrivateDocuments, false);
  assert.equal(AuditMetadataRule.storesSensitivePersonalInformation, false);
  assert.equal(validateAuditMetadata(validAuditRecord.metadata).valid, true);
  assert.equal(validateAuditMetadataSafety({ passwordHash: 'never', accessToken: 'never', privateDocumentRef: 'never' }).valid, false);
});

test('audit validation covers event actor resource action result and metadata safety only', () => {
  assert.deepEqual(APPROVED_AUDIT_ACTIONS, Object.values(AuditAction));
  assert.deepEqual(APPROVED_AUDIT_RESULTS, Object.values(AuditResult));
  assert.equal(validateAuditFoundation(validAuditRecord).valid, true);
  const invalid = validateAuditFoundation({ eventName: 'LOGIN', actorRef: 'bad ref', action: 'track', resourceRef: 'payment:001', result: 'ranked', metadata: { previousStateRef: 'bad', newStateRef: 'bad', token: 'never' } });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'eventName'));
  assert.ok(invalid.errors.some((error) => error.field === 'actorRef'));
  assert.ok(invalid.errors.some((error) => error.field === 'action'));
  assert.ok(invalid.errors.some((error) => error.field === 'result'));
  assert.ok(invalid.errors.some((error) => error.field === 'token'));
});

test('audit visibility prevents public private and operational metadata leakage', () => {
  assert.deepEqual(AuditVisibilityRule.public, []);
  assert.deepEqual(AuditVisibilityRule.private, []);
  assert.ok(AuditVisibilityRule.internal.includes('auditMetadataRef'));
  assert.equal(validateAuditVisibilityExposure({ visibility: AuditVisibility.INTERNAL }).valid, true);
  assert.equal(validateAuditVisibilityExposure({ visibility: AuditVisibility.PUBLIC, exposesAuditInformation: true }).valid, false);
  assert.equal(validateAuditVisibilityExposure({ visibility: AuditVisibility.PRIVATE, exposesAuditInformation: true }).valid, false);
  assert.equal(validateAuditVisibilityExposure({ visibility: AuditVisibility.INTERNAL, exposesOperationalMetadata: true }).valid, false);
});

test('dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/audit/domain/audit-types.mjs',
    'backend/modules/audit/domain/audit-events.mjs',
    'backend/modules/audit/domain/metadata-policy.mjs',
    'backend/modules/audit/domain/security-policy.mjs',
    'backend/modules/audit/domain/visibility.mjs',
    'backend/modules/audit/schemas/audit-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(frontend|payments|marketplace|ai_systems|tracking_systems|apps\/backend)/i);
  assert.doesNotMatch(content, /controller|route handler|migration|ORM model|database connection|authorization middleware|production logging pipeline|admin dashboard/i);
});

test('audit security boundaries keep audit separate from logging analytics database and authorization', () => {
  assert.equal(AuditSecurityPolicy.separateFromLogging, true);
  assert.equal(AuditSecurityPolicy.separateFromAnalytics, true);
  assert.equal(AuditSecurityPolicy.separateFromDatabase, true);
  assert.equal(AuditSecurityPolicy.separateFromAuthorization, true);
  assert.equal(AuditSecurityPolicy.storesSecretsCredentialsPasswordsTokens, false);
  assert.equal(AuditSecurityPolicy.storesPrivateUserInformation, false);
  assert.equal(AuditSecurityPolicy.exposesAuditInformationPublicly, false);
});

test('audit foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/audit/README.md');
  assert.equal(AuditSecurityPolicy.implementsSurveillanceSystem, false);
  assert.equal(AuditSecurityPolicy.implementsUserTrackingSystem, false);
  assert.equal(AuditSecurityPolicy.implementsSocialActivityTracking, false);
  assert.equal(AuditSecurityPolicy.implementsRankingAuditEngine, false);
  assert.equal(AuditSecurityPolicy.implementsAdvertisingAnalyticsSystem, false);
  assert.equal(AuditSecurityPolicy.implementsPaymentAuditSystem, false);
  assert.match(readme, /surveillance system/);
  assert.match(readme, /user tracking system/);
  assert.match(readme, /social activity tracking/);
  assert.match(readme, /ranking audit engine/);
  assert.match(readme, /advertising analytics system/);
  assert.match(readme, /payment audit system/);
});
