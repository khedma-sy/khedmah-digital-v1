import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mission 069L inventories runtime error ownership without changing it', async () => {
  const doc = await read('docs/contracts/ERROR-AUDIT-RUNTIME-MAPPING-CONTRACT.md');
  for (const error of ['IdentityValidationError', 'SafeAuthenticationError', 'OrganizationAccessError', 'ContactRateLimitError', 'AnalyticsValidationError']) assert.match(doc, new RegExp(`\`${error}\``));
  assert.match(doc, /global filter does not preserve a canonical domain code or category/);
  assert.match(doc, /does not serialize stack traces or exception objects/);
});

test('Mission 069L preserves canonical meaning and runtime HTTP ownership', async () => {
  const doc = await read('docs/contracts/ERROR-AUDIT-RUNTIME-MAPPING-CONTRACT.md');
  for (const category of ['VALIDATION_ERROR', 'IDENTITY_ERROR', 'OWNERSHIP_ERROR', 'LIFECYCLE_ERROR', 'VISIBILITY_ERROR', 'DUPLICATE_ERROR', 'DATABASE_ERROR']) assert.match(doc, new RegExp(`\`${category}\``));
  assert.match(doc, /Domain modules create canonical errors and never choose HTTP status/);
  assert.match(doc, /Runtime owns HTTP status, response formatting, localization, and safe public messages/);
  assert.match(doc, /must not import NestJS exceptions, controllers, HTTP status constants/);
});

test('Mission 069L prevents unsafe error and database disclosure', async () => {
  const doc = await read('docs/contracts/ERROR-AUDIT-RUNTIME-MAPPING-CONTRACT.md');
  assert.match(doc, /must not be passed directly to HTTP responses or logs/);
  assert.match(doc, /no SQL, table, constraint, host, driver, or query data/);
  assert.match(doc, /Authentication failure remains generic/);
  assert.match(doc, /Unknown canonical errors fail closed/);
});

test('Mission 069L inventories the runtime audit shape and canonical gaps', async () => {
  const doc = await read('docs/contracts/ERROR-AUDIT-RUNTIME-MAPPING-CONTRACT.md');
  assert.match(doc, /in-memory `AuditLog` array inside `IdentityRepository`/);
  assert.match(doc, /lower-case dot notation instead of governed `UPPERCASE_SNAKE_CASE`/);
  assert.match(doc, /lack explicit action, resource reference, result, and governed metadata/);
  assert.match(doc, /Audit storage is owned by Identity/);
});

test('Mission 069L maps required events while blocking unsupported emission', async () => {
  const doc = await read('docs/contracts/ERROR-AUDIT-RUNTIME-MAPPING-CONTRACT.md');
  for (const event of ['USER_ACCOUNT_CREATED', 'USER_ACCOUNT_UPDATED', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PROFILE_UPDATED', 'BUSINESS_PROFILE_CREATED', 'ORGANIZATION_CREATED']) assert.match(doc, new RegExp(`\`${event}\``));
  assert.match(doc, /not currently present in the canonical Audit event registry or action vocabulary/);
  assert.match(doc, /Contact snapshots cannot emit this event/);
  assert.match(doc, /New canonical code must not emit the dot-delimited aliases/);
});

test('Mission 069L separates audit, logging, analytics, authorization, and tracking', async () => {
  const doc = await read('docs/contracts/ERROR-AUDIT-RUNTIME-MAPPING-CONTRACT.md');
  assert.match(doc, /not request logging, analytics, product telemetry, click tracking, surveillance, or an authorization mechanism/);
  assert.match(doc, /`contact\.click\.tracked` and related click\/analytics recording are explicitly \*\*not approved as canonical Audit events\*\*/);
  assert.match(doc, /KILL CRITICAL result: RECONCILIATION REQUIRED; NO NEW KILL CRITICAL CAPABILITY INTRODUCED/);
});

test('Mission 069L defines non-implemented adapters and no database changes', async () => {
  const doc = await read('docs/contracts/ERROR-AUDIT-RUNTIME-MAPPING-CONTRACT.md');
  assert.match(doc, /### Runtime Error Adapter/);
  assert.match(doc, /### Runtime Audit Adapter/);
  assert.match(doc, /creates no audit table, error table, logging table, migration, database model, or persistence repository/);
  assert.match(doc, /No adapter, provider, filter modification, controller wiring, storage, or runtime behavior is implemented/);
  assert.match(doc, /ERROR & AUDIT MAPPING STATUS: REQUIRES FURTHER RECONCILIATION/);
});

test('Mission 069L forbids sensitive error and audit payloads', async () => {
  const doc = await read('docs/contracts/ERROR-AUDIT-RUNTIME-MAPPING-CONTRACT.md');
  for (const forbidden of ['password hashes', 'session tokens', 'email addresses', 'IP addresses', 'request/response bodies', 'stack traces', 'financial data']) assert.match(doc, new RegExp(forbidden));
  assert.match(doc, /Public error envelopes use stable safe codes\/messages and opaque request\/correlation ids only/);
});
