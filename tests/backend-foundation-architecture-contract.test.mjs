import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const docPath = 'docs/contracts/BACKEND-FOUNDATION-ARCHITECTURE-CONTRACT.md';

test('backend architecture contract exists and records repository identity', async () => {
  const doc = await read(docPath);

  assert.match(doc, /# Backend Foundation Architecture Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
  assert.match(doc, /No legacy repository detected/);
});

test('backend principles and layered architecture are documented', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Backend Architecture Principles/);
  assert.match(doc, /backend architecture goals/i);
  assert.match(doc, /scalability principles/i);
  assert.match(doc, /module isolation principles/i);
  assert.match(doc, /maintainability rules/i);
  assert.match(doc, /security-first principles/i);
  assert.match(doc, /testing-first principles/i);
  assert.match(doc, /Mission 043 Architecture Freeze/);
  assert.match(doc, /Mission 044 Database Architecture/);
  assert.match(doc, /Mission 048 Migration Plan/);
  assert.match(doc, /API Layer\n↓\nApplication Service Layer\n↓\nDomain Layer\n↓\nRepository\/Data Access Layer\n↓\nDatabase Layer/);
  assert.match(doc, /business logic inside controllers/i);
  assert.match(doc, /direct database access from API layer/i);
  assert.match(doc, /duplicated logic/i);
});

test('backend modules, API boundaries, services, and repositories are documented', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Module Architecture/);
  for (const moduleName of [
    'Identity Module',
    'User Module',
    'Profile Module',
    'Organization Module',
    'Business Profile Module',
    'Professional Profile Module',
    'Service Catalog Module',
    'Location Module',
    'Trust & Verification Module',
    'Relationship Module',
    'Audit Module',
    'Analytics Module',
  ]) {
    assert.match(doc, new RegExp(moduleName));
  }
  assert.match(doc, /responsibility/);
  assert.match(doc, /owned data/);
  assert.match(doc, /allowed dependencies/);
  assert.match(doc, /forbidden dependencies/);
  assert.match(doc, /API Boundary Architecture/);
  assert.match(doc, /route grouping principles/);
  assert.match(doc, /versioning/i);
  assert.match(doc, /response consistency/i);
  assert.match(doc, /Service Layer Contract/);
  assert.match(doc, /Create Business Profile/);
  assert.match(doc, /Submit Verification Request/);
  assert.match(doc, /Assign Organization Member/);
  assert.match(doc, /Update Service/);
  assert.match(doc, /Repository Pattern Contract/);
  assert.match(doc, /data access/);
  assert.match(doc, /transactions/);
  assert.match(doc, /pagination/);
});

test('configuration, security, error handling, testing, logging, and deployment rules exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Configuration Architecture/);
  assert.match(doc, /Environment configuration/);
  assert.match(doc, /Application configuration/);
  assert.match(doc, /Feature configuration/);
  assert.match(doc, /Security configuration/);
  assert.match(doc, /No secrets in code/);
  assert.match(doc, /hardcoded credentials/i);
  assert.match(doc, /production values/i);
  assert.match(doc, /Security Architecture/);
  assert.match(doc, /authentication boundary/i);
  assert.match(doc, /authorization boundary/i);
  assert.match(doc, /role permissions/i);
  assert.match(doc, /input validation/i);
  assert.match(doc, /rate limiting/i);
  assert.match(doc, /audit logging/i);
  assert.match(doc, /sensitive data protection/i);
  assert.match(doc, /Error Handling Architecture/);
  assert.match(doc, /Request\n↓\nValidation\n↓\nBusiness Error\n↓\nResponse\n↓\nAudit/);
  assert.match(doc, /Mission 041 API Error Contract/);
  assert.match(doc, /Mission 042 Error Diagnosis Contract/);
  assert.match(doc, /Testing Architecture/);
  assert.match(doc, /Unit tests/);
  assert.match(doc, /Integration tests/);
  assert.match(doc, /API tests/);
  assert.match(doc, /Security tests/);
  assert.match(doc, /Regression tests/);
  assert.match(doc, /Logging & Observability/);
  assert.match(doc, /request IDs/);
  assert.match(doc, /error logs/);
  assert.match(doc, /audit logs/);
  assert.match(doc, /Deployment Readiness Review/);
  assert.match(doc, /Development\n↓\nTesting\n↓\nStaging\n↓\nProduction/);
});

test('automation boundaries, kill-critical review, V1 boundaries, and readiness are documented', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Background Jobs & Automation Boundary/);
  assert.match(doc, /automatic marketplace matching/);
  assert.match(doc, /AI decisions/);
  assert.match(doc, /automatic ranking/);
  assert.match(doc, /advertising automation/);
  assert.match(doc, /unauthorized workflows/);
  assert.match(doc, /KILL CRITICAL Backend Audit/);
  assert.match(doc, /marketplace backend drift/i);
  assert.match(doc, /payment services/i);
  assert.match(doc, /commission engines/i);
  assert.match(doc, /advertising engines/i);
  assert.match(doc, /ranking engines/i);
  assert.match(doc, /social network backend/i);
  assert.match(doc, /AI decision engines/i);
  assert.match(doc, /unnecessary tracking systems/i);
  assert.match(doc, /backend code/);
  assert.match(doc, /API routes/);
  assert.match(doc, /database connections/);
  assert.match(doc, /ORM models/);
  assert.match(doc, /migrations/);
  assert.match(doc, /authentication code/);
  assert.match(doc, /authorization middleware/);
  assert.match(doc, /production infrastructure/);
  assert.match(doc, /96 \/ 100/);
  assert.match(doc, /Mission 050/);
});

test('RTL Arabic direction remains preserved for backend foundation readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
