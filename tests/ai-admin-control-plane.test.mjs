import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('AI Admin control plane is persistent and disabled by default', async () => {
  const migration = await read('backend/migrations/versions/026_ai_admin_control_plane.sql');
  assert.match(migration, /enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /monthly_budget_usd_cents INTEGER NOT NULL DEFAULT 5000/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_admin_audit_events/);
  assert.match(migration, /VALUES \('global', FALSE, 'supervised', 5000\)/);
});

test('AI management permission is owner-only in the current RBAC map', async () => {
  const source = await read('apps/backend/src/operations-product/operations-product.types.ts');
  assert.match(source, /OperationsPermission[^\n]*'ai\.manage'/);
  const roleLines = source.split('\n').filter((line) => /^\s{2}[a-z_]+: \[/.test(line));
  const aiRoles = roleLines.filter((line) => line.includes("'ai.manage'"));
  assert.equal(aiRoles.length, 1);
  assert.match(aiRoles[0], /operations_product_director/);
});

test('AI Admin exposes only guarded status and activation endpoints', async () => {
  const [controller, service] = await Promise.all([
    read('apps/backend/src/ai-admin/ai-admin.controller.ts'),
    read('apps/backend/src/ai-admin/ai-admin.service.ts')
  ]);
  assert.match(controller, /@Controller\('admin\/ai-admin'\)/);
  assert.match(controller, /@Get\('status'\)/);
  assert.match(controller, /@Post\('state'\)/);
  assert.match(service, /this\.rbac\.assert\(actor\.email, 'ai\.manage'\)/);
  assert.match(service, /providerConfigured: Boolean\(process\.env\.OPENAI_API_KEY\)/);
  assert.match(service, /executionAvailable: false as const/);
  assert.doesNotMatch(service, /process\.env\.OPENAI_API_KEY\s*[,}]/);
});

test('admin dashboard contains the owner-visible enable-disable control', async () => {
  const [page, control] = await Promise.all([
    read('apps/frontend/app/admin/page.tsx'),
    read('apps/frontend/app/admin/components/ai-admin-control.tsx')
  ]);
  assert.match(page, /permissions\.includes\('ai\.manage'\)/);
  assert.match(page, /<AiAdminControl \/>/);
  assert.match(page, /href="\/admin\/ai"/);
  assert.match(control, /aiAdminApi\.setEnabled\(!status\.enabled\)/);
  assert.match(control, /تفعيل المدير الذكي/);
  assert.match(control, /تعطيل المدير الذكي/);
  assert.match(control, /executionAvailable/);
});

test('AI Admin contract forbids direct secret and production autonomy', async () => {
  const contract = await read('docs/ai-admin/KHEDMA-AI-ADMIN-CONTROL-CONTRACT.md');
  assert.match(contract, /disabled by default/i);
  assert.match(contract, /never receives database credentials, API keys, service-account keys, passwords, or Secret Manager payloads/i);
  assert.match(contract, /Production deploys.*require explicit human approval/i);
  assert.match(contract, /server-side kill switch/i);
});
