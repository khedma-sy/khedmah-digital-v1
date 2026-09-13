import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [controller, service, repository, moduleSource, appModule, appSource, contract] = await Promise.all([
  read('apps/backend/src/kora-admin/kora-admin.controller.ts'),
  read('apps/backend/src/kora-admin/kora-admin.service.ts'),
  read('apps/backend/src/kora-admin/kora-admin.repository.ts'),
  read('apps/backend/src/kora-admin/kora-admin.module.ts'),
  read('apps/backend/src/app.module.ts'),
  read('apps/backend/src/app.ts'),
  read('docs/operations/KORA-ADMIN-OPERATING-CONTRACT.md')
]);

test('KORA is a separate operations module with protected admin endpoints', () => {
  assert.match(controller, /@Controller\('admin\/kora'\)/);
  for (const route of ['metrics', 'ui-failures', 'anomalies', 'executive', 'expose']) {
    assert.match(controller, new RegExp(`@Get\\('${route}'\\)`));
  }
  for (const route of ['ui-failures/evaluate', 'tasks/draft', 'killcritic', 'autopsy']) {
    assert.match(controller, new RegExp(`@Post\\('${route}'\\)`));
  }
  assert.match(moduleSource, /OperationsProductModule/);
  assert.match(appModule, /KoraAdminModule/);
  assert.doesNotMatch(`${controller}\n${service}\n${moduleSource}`, /ai\.manage|OPENAI_API_KEY|admin\/ai-admin/);
});

test('read_metrics uses fixed aggregate reads and marks unsupported metrics unavailable instead of zero', () => {
  assert.match(repository, /SELECT COUNT\(\*\)::text AS count FROM core_user_accounts/);
  assert.match(repository, /event_type='search_action'/);
  assert.match(service, /tool: 'read_metrics'/);
  assert.match(service, /status: 'not_instrumented'/);
  assert.match(service, /truthfulUnavailableValues: true/);
  assert.match(service, /Process-local only/);
  assert.doesNotMatch(repository, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(repository, /SELECT\s+\*/i);
});

test('detect_ui_failures never claims live browser state without supplied evidence', () => {
  assert.match(service, /liveBrowserEvidenceConnected: false/);
  assert.match(service, /status: 'not_observed'/);
  assert.match(service, /structured_ui_observation/);
  assert.match(service, /automaticActionAuthorized: false/);
  assert.match(contract, /must not invent live browser evidence/i);
});

test('operational anomaly review is deterministic and does not turn telemetry gaps into zero values', () => {
  assert.match(service, /incident\.severity === 'high' \|\| incident\.severity === 'critical'/);
  assert.match(service, /coverageGaps:/);
  assert.match(service, /missing telemetry is never interpreted as zero/);
  assert.match(service, /automaticDecisionAuthorized: false/);
});

test('draft_admin_tasks remains supervised and cannot auto-execute even at low severity', () => {
  assert.match(service, /tool: 'draft_admin_tasks'/);
  assert.match(service, /autoExecutable: false/);
  assert.match(service, /approvalRequired: input\.severity === 'high' \|\| input\.severity === 'critical'/);
});

test('Executive Expose KillCritic and Autopsy modes preserve human and evidence boundaries', () => {
  assert.match(service, /mode: 'executive'/);
  assert.match(service, /mode: 'expose'/);
  assert.match(service, /mode: 'killcritic'/);
  assert.match(service, /mode: 'autopsy'/);
  assert.match(service, /input\.targetEnvironment === 'production'/);
  assert.match(service, /automaticExecutionAllowed: false/);
  assert.match(service, /status: 'undetermined'/);
  assert.match(contract, /deploy to Production/i);
  assert.match(contract, /destructive account actions/i);
});

test('KORA admin surface is rate limited and contains no secret or cloud execution path', () => {
  assert.match(appSource, /\/api\/v1\/admin\/kora/);
  assert.match(appSource, /'kora\.admin'/);
  assert.doesNotMatch(`${controller}\n${service}\n${repository}`, /SecretManager|service-account|child_process|\bexec\(|\bgcloud\b|process\.env/);
});
