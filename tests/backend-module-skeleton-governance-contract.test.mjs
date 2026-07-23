import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const docPath = 'docs/contracts/BACKEND-MODULE-SKELETON-GOVERNANCE-CONTRACT.md';

test('module skeleton contract exists and records repository identity', async () => {
  const doc = await read(docPath);

  assert.match(doc, /# Backend Module Skeleton Governance Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
  assert.match(doc, /No legacy repository detected/);
});

test('backend project structure and module skeleton are documented', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Backend Project Structure Contract/);
  assert.match(doc, /backend\//);
  assert.match(doc, /modules\//);
  assert.match(doc, /core\//);
  assert.match(doc, /config\//);
  assert.match(doc, /database\//);
  assert.match(doc, /shared\//);
  assert.match(doc, /tests\//);
  assert.match(doc, /migrations\//);
  assert.match(doc, /Module Skeleton Governance/);
  assert.match(doc, /module_name\//);
  assert.match(doc, /api\//);
  assert.match(doc, /application\//);
  assert.match(doc, /domain\//);
  assert.match(doc, /repositories\//);
  assert.match(doc, /schemas\//);
});

test('official module list and dependency rules exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Official Module List/);
  for (const moduleName of [
    'Identity',
    'Users',
    'Profiles',
    'Organizations',
    'Business Profiles',
    'Professional Profiles',
    'Service Catalog',
    'Locations',
    'Trust & Verification',
    'Relationships',
    'Audit',
    'Analytics',
  ]) {
    assert.match(doc, new RegExp(moduleName));
  }
  assert.match(doc, /responsibility/);
  assert.match(doc, /owned data/);
  assert.match(doc, /allowed dependencies/);
  assert.match(doc, /forbidden dependencies/);
  assert.match(doc, /Dependency Rules/);
  assert.match(doc, /API\n↓\nApplication\n↓\nDomain\n↓\nRepository\n↓\nDatabase/);
  assert.match(doc, /circular dependencies/);
  assert.match(doc, /module-to-module database access/);
  assert.match(doc, /duplicated business rules/);
});

test('shared core governance, naming standards, testing structure, and configuration rules exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Shared Core Governance/);
  assert.match(doc, /configuration/);
  assert.match(doc, /errors/);
  assert.match(doc, /validation/);
  assert.match(doc, /logging/);
  assert.match(doc, /security helpers/);
  assert.match(doc, /common types/);
  assert.match(doc, /placing business logic inside shared code/);
  assert.match(doc, /File Naming Standards/);
  assert.match(doc, /files/);
  assert.match(doc, /folders/);
  assert.match(doc, /classes/);
  assert.match(doc, /services/);
  assert.match(doc, /repositories/);
  assert.match(doc, /schemas/);
  assert.match(doc, /Testing Structure/);
  assert.match(doc, /Unit tests/);
  assert.match(doc, /Integration tests/);
  assert.match(doc, /Module tests/);
  assert.match(doc, /Security tests/);
  assert.match(doc, /Regression tests/);
  assert.match(doc, /Configuration Governance/);
  assert.match(doc, /environment variables/);
  assert.match(doc, /application settings/);
  assert.match(doc, /feature flags/);
  assert.match(doc, /secrets management/);
  assert.match(doc, /Hardcoded secrets are prohibited/);
});

test('error logging, security, readiness, kill-critical review, and boundaries exist', async () => {
  const doc = await read(docPath);

  assert.match(doc, /Error & Logging Governance/);
  assert.match(doc, /common errors/);
  assert.match(doc, /request IDs/);
  assert.match(doc, /structured logs/);
  assert.match(doc, /audit events/);
  assert.match(doc, /sensitive information logging/);
  assert.match(doc, /Security Boundary Review/);
  assert.match(doc, /authentication boundary/);
  assert.match(doc, /authorization boundary/);
  assert.match(doc, /permission checks/);
  assert.match(doc, /data access rules/);
  assert.match(doc, /privilege escalation/);
  assert.match(doc, /unauthorized access/);
  assert.match(doc, /Backend Implementation Readiness Review/);
  assert.match(doc, /Mission 051/);
  assert.match(doc, /KILL CRITICAL Backend Structure Audit/);
  assert.match(doc, /Marketplace modules/);
  assert.match(doc, /Payment modules/);
  assert.match(doc, /Commission modules/);
  assert.match(doc, /Advertising modules/);
  assert.match(doc, /Social modules/);
  assert.match(doc, /AI modules/);
  assert.match(doc, /Ranking modules/);
  assert.match(doc, /Unnecessary tracking modules/);
  assert.match(doc, /backend source code/);
  assert.match(doc, /API routes/);
  assert.match(doc, /database models/);
  assert.match(doc, /services implementation/);
  assert.match(doc, /repositories implementation/);
  assert.match(doc, /97 \/ 100/);
});

test('RTL Arabic direction remains preserved for backend skeleton governance readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
