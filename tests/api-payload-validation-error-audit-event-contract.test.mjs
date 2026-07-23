import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('API payload validation error audit event contract exists and records repository identity', async () => {
  const doc = await read('docs/contracts/API-PAYLOAD-VALIDATION-ERROR-AUDIT-EVENT-CONTRACT.md');

  assert.match(doc, /# API Payload, Validation Error & Audit Event Naming Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
});

test('API contract defines principles, request separation, and payload examples', async () => {
  const doc = await read('docs/contracts/API-PAYLOAD-VALIDATION-ERROR-AUDIT-EVENT-CONTRACT.md');

  assert.match(doc, /Consistent naming/);
  assert.match(doc, /Predictable structures/);
  assert.match(doc, /Validation clarity/);
  assert.match(doc, /Security boundaries/);
  assert.match(doc, /Version compatibility/);
  assert.match(doc, /Request\n↓\nValidation\n↓\nBusiness Logic\n↓\nResponse\n↓\nAudit Event/);
  assert.match(doc, /Create Business Profile Request Shape/);
  assert.match(doc, /Create Service Request Shape/);
  assert.match(doc, /Create Organization Member Request Shape/);
  assert.match(doc, /Submit Verification Request Shape/);
});

test('API contract defines response structures and validation errors', async () => {
  const doc = await read('docs/contracts/API-PAYLOAD-VALIDATION-ERROR-AUDIT-EVENT-CONTRACT.md');

  assert.match(doc, /Success Response Structure/);
  assert.match(doc, /Error Response Structure/);
  assert.match(doc, /Pagination Principles/);
  assert.match(doc, /Metadata Principles/);
  assert.match(doc, /REQUIRED_FIELD/);
  assert.match(doc, /INVALID_FORMAT/);
  assert.match(doc, /INVALID_VALUE/);
  assert.match(doc, /DUPLICATE_RESOURCE/);
  assert.match(doc, /UNAUTHORIZED_ACTION/);
  assert.match(doc, /FORBIDDEN_ACTION/);
  assert.match(doc, /RESOURCE_NOT_FOUND/);
  assert.match(doc, /INVALID_RELATIONSHIP/);
  assert.match(doc, /INVALID_STATE_TRANSITION/);
});

test('API contract defines lifecycle errors, audit events, relationships, and V1 boundaries', async () => {
  const doc = await read('docs/contracts/API-PAYLOAD-VALIDATION-ERROR-AUDIT-EVENT-CONTRACT.md');

  assert.match(doc, /Pending states/);
  assert.match(doc, /Suspended accounts/);
  assert.match(doc, /Archived resources/);
  assert.match(doc, /Actor\n↓\nAction\n↓\nResource\n↓\nResult/);
  assert.match(doc, /USER_PROFILE_UPDATED/);
  assert.match(doc, /BUSINESS_PROFILE_SUBMITTED/);
  assert.match(doc, /VERIFICATION_APPROVED/);
  assert.match(doc, /MEMBER_ROLE_CHANGED/);
  assert.match(doc, /OWNERSHIP_TRANSFERRED/);
  assert.match(doc, /Relationship Reference Contract/);
  assert.match(doc, /userId/);
  assert.match(doc, /profileId/);
  assert.match(doc, /organizationId/);
  assert.match(doc, /businessProfileId/);
  assert.match(doc, /serviceId/);
  assert.match(doc, /partnerProfileId/);
  assert.match(doc, /representativeProfileId/);
  assert.match(doc, /locationId/);
  assert.match(doc, /This mission does not implement/);
  assert.match(doc, /API endpoints/);
  assert.match(doc, /Authentication APIs/);
  assert.match(doc, /Payment APIs/);
  assert.match(doc, /Marketplace APIs/);
  assert.match(doc, /Ordering APIs/);
  assert.match(doc, /Messaging APIs/);
  assert.match(doc, /AI APIs/);
  assert.match(doc, /Analytics pipelines/);
});

test('RTL Arabic direction remains preserved for API contract readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
