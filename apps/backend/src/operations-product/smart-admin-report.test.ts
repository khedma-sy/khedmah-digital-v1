import assert from 'node:assert/strict';
import test from 'node:test';
import { OperationsProductService } from './operations-product.service';
import { readFile } from 'node:fs/promises';

test('smart admin report is permission-gated, aggregated and advisory only', async () => {
  const identity = { getCurrentUser: async () => ({ id: 'owner', email: 'owner@example.com' }) };
  const rbac = { assert: () => ['operations_product_director'], permissionsFor: () => ['operations.read'] };
  const analytics = { adminSummary: async () => ({ periodDays: 30, totalEvents: 8, eventCounts: { business_view: 2, search_action: 6, contact_click: 0, inquiry_submitted: 0 }, topSearches: [{ term: 'كهربائي', count: 3 }], unmetSearches: [{ term: 'كهربائي', count: 3 }] }) };
  const service = new OperationsProductService(identity as never, {} as never, rbac as never, { listIncidents: () => [], listChanges: () => [] } as never, analytics as never);
  const report = await service.smartAdminReport('session=valid');
  assert.equal(report.privacy.minimumSearchCohort, 3);
  assert.equal(report.privacy.rawUserTextExposed, false);
  assert.equal(report.automation.canExecuteActions, false);
  assert.equal(report.automation.humanApprovalRequired, true);
  assert.ok(report.recommendations.some((item) => item.title === 'طلب غير ملبّى'));
  assert.ok(report.recommendations.some((item) => item.title === 'انقطاع قبل التواصل'));
});

test('public analytics ingestion is protected by the shared persistent rate limiter', async () => {
  const app = await readFile(new URL('../app.ts', import.meta.url), 'utf8');
  assert.match(app, /\/api\/v1\/analytics\/events/);
  assert.match(app, /'analytics\.events', publicWindowMs, publicMax/);
});
