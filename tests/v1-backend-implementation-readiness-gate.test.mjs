import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const docPath = 'docs/audits/MISSION-065-V1-BACKEND-IMPLEMENTATION-READINESS-GATE.md';

test('Mission 065 readiness audit exists and preserves repository identity', async () => {
  const doc = await read(docPath);
  assert.match(doc, /# Mission 065 — V1 Backend Implementation Readiness Gate/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /Repository basename: `khedmah-digital-v1`/);
  assert.match(doc, /Legacy repository detected: No/);
});

test('Mission 065 recognizes all completed foundation modules', async () => {
  const doc = await read(docPath);
  for (const foundation of ['Backend Core Infrastructure', 'Identity', 'Users', 'Profiles', 'Professional Profiles', 'Business Profiles', 'Organizations', 'Service Catalog', 'Locations', 'Trust Verification', 'Relationships', 'Audit', 'Analytics']) {
    assert.match(doc, new RegExp(foundation));
  }
  assert.match(doc, /All completed modules are compatible by reference-first contracts/);
});

test('Mission 065 dependency graph rules exist', async () => {
  const doc = await read(docPath);
  assert.match(doc, /Core\n↓\nIdentity \/ Users \/ Profiles\n↓\nBusiness \/ Professional \/ Organization\n↓\nService \/ Location \/ Trust \/ Relationships\n↓\nAudit \/ Analytics/);
  assert.match(doc, /Circular dependencies: None approved/);
  assert.match(doc, /direct module-to-module database access remains forbidden/);
});

test('Mission 065 database and API implementation readiness exists without implementation', async () => {
  const doc = await read(docPath);
  assert.match(doc, /Database implementation is ready to begin in a separate mission/);
  assert.match(doc, /Entities are defined/);
  assert.match(doc, /Relationships are defined/);
  assert.match(doc, /Fields and constraints are defined/);
  assert.match(doc, /Lifecycle rules are defined/);
  assert.match(doc, /API implementation is ready for later approved missions/);
  assert.match(doc, /API payload rules/);
  assert.match(doc, /Request validation principles/);
  assert.match(doc, /Response and error structures/);
  assert.match(doc, /Audit event naming compatibility/);
  assert.doesNotMatch(doc, /CREATE TABLE|@Controller|@Get\(|@Post\(|migration file|database connection string/i);
});

test('Mission 065 security rules and testing strategy exist', async () => {
  const doc = await read(docPath);
  assert.match(doc, /Authentication boundary is identified but not implemented/);
  assert.match(doc, /Authorization boundary is identified but not implemented/);
  assert.match(doc, /Privacy boundaries exist/);
  assert.match(doc, /Secret management rules prohibit hardcoded secrets/);
  assert.match(doc, /no hardcoded secrets, tokens, passwords, credentials, or private data exposure/);
  assert.match(doc, /Unit tests/);
  assert.match(doc, /Integration tests/);
  assert.match(doc, /API tests/);
  assert.match(doc, /Security tests/);
  assert.match(doc, /Regression tests/);
});

test('Mission 065 V1 boundaries and KILL CRITICAL review exist', async () => {
  const doc = await read(docPath);
  for (const forbidden of ['Marketplace', 'Payments', 'Orders', 'Delivery marketplace', 'Commission systems', 'Advertising', 'Ranking manipulation', 'Social network', 'AI recommendation engine', 'Tracking systems']) {
    assert.match(doc, new RegExp(forbidden));
  }
  assert.match(doc, /Architecture drift: Not detected/);
  assert.match(doc, /Database drift: Not introduced/);
  assert.match(doc, /API drift: Not introduced/);
  assert.match(doc, /Security drift: Not detected/);
  assert.match(doc, /Feature creep: Not introduced/);
});

test('Mission 065 implementation decision is ready and recommends Mission 066 only', async () => {
  const doc = await read(docPath);
  assert.match(doc, /\*\*READY FOR IMPLEMENTATION\*\*/);
  assert.match(doc, /Mission 066 — Database Implementation Phase 1/);
  assert.match(doc, /Do not begin analytics pipelines, dashboards, AI, tracking, marketplace, payments, frontend, API implementation, authentication, authorization middleware, or production infrastructure/);
});
