import assert from 'node:assert/strict';
import test from 'node:test';
import { OperationsProductService } from './operations-product.service';
import { readFile } from 'node:fs/promises';

test('smart admin report exposes bounded product auto-approval results', async () => {
  const identity = { getCurrentUser: async () => ({ id: 'owner', email: 'owner@example.com' }) };
  const rbac = { assert: () => ['operations_product_director'], permissionsFor: () => ['operations.read'] };
  const analytics = { adminSummary: async () => ({ periodDays: 30, totalEvents: 8, eventCounts: { business_view: 2, search_action: 6, contact_click: 0, inquiry_submitted: 0 }, topSearches: [{ term: 'كهربائي', count: 3 }], unmetSearches: [{ term: 'كهربائي', count: 3 }] }) };
  const identityRepository = { countAuditEvents: async () => ({ 'product.auto_approved': 7, 'product.auto_review_required': 2 }) };
  const platform = {
    businesses: { pending: 2 }, professionals: { pending: 1 }, verifications: { pending: 1 }, products: { pending: 3 }, promotions: { pending: 1, live: 4 },
    orders: { stale: 1, unassigned: 1 }, mobility: { stale: 1 }, professionalJobs: { attention: 1, revisitRequested: 1 },
    contactInquiries: { overdue: 2 }, reports: { open: 1 }, incidents: { open: 1 },
    domains: [{ id: 'identity', management: 'managed', total: 10, attention: 0, state: 'clear' }]
  };
  const repository = { platformMetrics: async () => platform };
  const service = new OperationsProductService(identity as never, identityRepository as never, rbac as never, repository as never, analytics as never);
  const report = await service.smartAdminReport('session=valid');
  assert.equal(report.privacy.minimumSearchCohort, 3);
  assert.equal(report.privacy.rawUserTextExposed, false);
  assert.equal(report.productModeration.autoApproved, 7);
  assert.equal(report.productModeration.reviewRequired, 2);
  assert.equal(report.access.mode, 'full_internal_product_operations');
  assert.equal(report.access.auditTrailRequired, true);
  assert.equal(report.access.infrastructureSecretsExposed, false);
  assert.deepEqual(report.access.permissions, ['operations.read']);
  assert.equal(report.automation.canTriageAllDomains, true);
  assert.equal(report.automation.canRouteExceptionsToReview, true);
  assert.equal(report.automation.canAutoApproveEligibleProducts, true);
  assert.equal(report.automation.canAutoApproveEligiblePromotions, true);
  assert.equal(report.automation.canDeleteOrSuspendAutonomously, false);
  assert.equal(report.automation.humanApprovalRequiredForExceptions, true);
  assert.equal(report.promotionModeration.policyVersion, 'promotion-auto-v1');
  assert.deepEqual(report.platformCoverage, platform.domains);
  assert.ok(report.recommendations.some((item) => item.title === 'طلب غير ملبّى'));
  assert.ok(report.recommendations.some((item) => item.title === 'انقطاع قبل التواصل'));
  assert.ok(report.recommendations.some((item) => item.title === 'رحلات وطلبات تحتاج متابعة'));
  assert.ok(report.recommendations.some((item) => item.title === 'خدمات مهنية تحتاج تدخّلًا'));
  assert.ok(report.recommendations.some((item) => item.title === 'تواصل وثقة بحاجة للمتابعة'));
});

test('public analytics ingestion is protected by the shared persistent rate limiter', async () => {
  const app = await readFile(new URL('../app.ts', import.meta.url), 'utf8');
  assert.match(app, /\/api\/v1\/analytics\/events/);
  assert.match(app, /'analytics\.events', publicWindowMs, publicMax/);
});
