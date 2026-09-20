import assert from 'node:assert/strict';
import test from 'node:test';
import type { OperationsProductService } from '../operations-product/operations-product.service';
import type { KoraAdminRepository } from './kora-admin.repository';
import { KoraAdminService } from './kora-admin.service';

type KoraAuditCall = {
  cookie: string | undefined;
  eventType: Parameters<OperationsProductService['recordSupervisedAdminAudit']>[1];
  resource: string;
};

const DEFAULT_SERVICE_METRICS: Record<string, number> = {
  fulfillment_orders_24h: 8,
  food_orders_24h: 5,
  fulfillment_cancellations_24h: 1,
  delivery_waiting_assignment: 2,
  delivery_assignment_overdue: 0,
  billing_pending_orders: 3,
  billing_paid_orders_24h: 1,
  ads_active: 9,
  ads_pending_review: 2,
  ads_review_overdue_24h: 0,
  ads_expired_active: 0,
  store_active_products: 6,
  store_pending_review: 2,
  store_review_overdue_24h: 0,
  store_out_of_stock: 1,
  taxi_approved_drivers: 4,
  taxi_restricted_drivers: 1,
  taxi_expiring_approvals_7d: 0,
  contact_inquiries_24h: 7,
  contact_inquiries_open: 3,
  contact_inquiries_unread_24h: 0,
  provider_reports_open: 2,
  provider_reports_overdue_24h: 0,
  provider_reports_sensitive_open: 1,
  business_profiles_pending_review: 4,
  business_profiles_review_overdue_24h: 0,
  professional_profiles_pending_review: 3,
  professional_profiles_review_overdue_24h: 0,
  verification_requests_pending: 2,
  verification_requests_overdue_24h: 0,
  mobility_documents_pending: 5,
  mobility_documents_overdue_24h: 0
};

function createService(overrides: {
  histories?: () => Promise<{ incidents: Array<Record<string, unknown>>; changes: Array<Record<string, unknown>> }>;
  overview?: () => Promise<unknown>;
  countUsers?: () => Promise<number>;
  countSearchActionsSince?: (since: string) => Promise<number>;
  serviceMetrics?: () => Promise<Record<string,number>>;
  audits?: KoraAuditCall[];
} = {}) {
  const repository = {
    countUsers: overrides.countUsers ?? (async () => 12),
    countSearchActionsSince: overrides.countSearchActionsSince ?? (async () => 4),
    serviceMetrics: overrides.serviceMetrics ?? (async () => ({ ...DEFAULT_SERVICE_METRICS }))
  } as unknown as KoraAdminRepository;
  const operations = {
    histories: overrides.histories ?? (async () => ({ incidents: [], changes: [] })),
    overview: overrides.overview ?? (async () => ({})),
    recordSupervisedAdminAudit: async (cookie: string | undefined, eventType: KoraAuditCall['eventType'], resource: string) => {
      overrides.audits?.push({ cookie, eventType, resource });
    }
  } as unknown as OperationsProductService;
  return new KoraAdminService(repository, operations);
}

test('Kora authorizes metrics before any aggregate database read', async () => {
  let usersRead = false;
  let searchesRead = false;
  const service = createService({
    histories: async () => { throw new Error('OPERATIONS_READ_DENIED'); },
    countUsers: async () => { usersRead = true; return 1; },
    countSearchActionsSince: async () => { searchesRead = true; return 1; }
  });

  await assert.rejects(service.readMetrics(undefined), /OPERATIONS_READ_DENIED/);
  assert.equal(usersRead, false);
  assert.equal(searchesRead, false);
});

test('Kora reports measured values, never invents zero for missing telemetry, and audits direct metric reads', async () => {
  const audits: KoraAuditCall[] = [];
  const service = createService({ audits });
  const result = await service.readMetrics('session=operator');
  const users = result.metrics.find((metric) => metric.key === 'users_total');
  const searches = result.metrics.find((metric) => metric.key === 'searches_24h');
  const taxiApprovals = result.metrics.find((metric) => metric.key === 'taxi_approved_drivers');
  const ads = result.metrics.find((metric) => metric.key === 'ads_active');
  const store = result.metrics.find((metric) => metric.key === 'store_active_products');
  const inquiries = result.metrics.find((metric) => metric.key === 'contact_inquiries_24h');
  const reports = result.metrics.find((metric) => metric.key === 'provider_reports_open');
  const taxiTrips = result.metrics.find((metric) => metric.key === 'taxi_trip_metrics');
  const food = result.metrics.find((metric) => metric.key === 'food_metrics');

  assert.equal(users?.status, 'available');
  assert.equal(users?.value, 12);
  assert.equal(searches?.status, 'available');
  assert.equal(searches?.value, 4);
  assert.equal(taxiApprovals?.status, 'available');
  assert.equal(taxiApprovals?.value, 4);
  assert.equal(ads?.status, 'available');
  assert.equal(ads?.value, 9);
  assert.equal(store?.status, 'available');
  assert.equal(store?.value, 6);
  assert.equal(inquiries?.status, 'available');
  assert.equal(inquiries?.value, 7);
  assert.equal(reports?.status, 'available');
  assert.equal(reports?.value, 2);
  assert.equal(taxiTrips?.status, 'not_instrumented');
  assert.equal(taxiTrips?.value, undefined);
  assert.equal(food?.status, 'not_instrumented');
  assert.equal(food?.value, undefined);
  assert.equal(result.truthfulUnavailableValues, true);
  assert.deepEqual(audits, [{ cookie: 'session=operator', eventType: 'kora.metrics.read', resource: 'operational-metrics' }]);
});

test('Kora UI checklist stays unobserved until structured evidence is supplied and audits the direct read', async () => {
  const audits: KoraAuditCall[] = [];
  const service = createService({ audits });
  const checklist = await service.uiChecklist('session=operator');

  assert.equal(checklist.liveBrowserEvidenceConnected, false);
  assert.ok(checklist.checks.length > 0);
  assert.ok(checklist.checks.every((check) => check.status === 'not_observed'));
  assert.deepEqual(audits, [{ cookie: 'session=operator', eventType: 'kora.ui_checklist.read', resource: 'ui-readiness-checklist' }]);
});

test('Kora exposes scoped fulfillment and billing counts and an evidence-backed courier backlog finding',async()=>{
  const values={...DEFAULT_SERVICE_METRICS,delivery_waiting_assignment:4,delivery_assignment_overdue:2};
  const service=createService({serviceMetrics:async()=>values});
  const result=await service.readMetrics('operator');
  for(const [key,value] of Object.entries(values))assert.equal(result.metrics.find(m=>m.key===key)?.value,value);
  assert.equal(result.metrics.find(m=>m.key==='fulfillment_cancellations_24h')?.window,'created_last_24h');
  const anomalies=await service.reviewOperationalAnomalies('operator');
  const finding=anomalies.findings.find(f=>f.resource==='fulfillment:delivery-assignment');
  assert.equal(finding?.source,'canonical_database.fulfillment_orders');assert.match(finding!.evidence,/count=2;/);
  assert.equal(anomalies.automaticDecisionAuthorized,false);
});

test('Kora exposes canonical Ads Store and Taxi approval state and raises evidence-backed review findings',async()=>{
  const values={
    ...DEFAULT_SERVICE_METRICS,
    ads_review_overdue_24h:3,
    ads_expired_active:2,
    store_review_overdue_24h:4,
    taxi_expiring_approvals_7d:2
  };
  const service=createService({serviceMetrics:async()=>values});
  const result=await service.readMetrics('operator');
  for(const key of ['ads_active','ads_pending_review','store_active_products','store_pending_review','taxi_approved_drivers','taxi_restricted_drivers']) {
    assert.equal(result.metrics.find(m=>m.key===key)?.status,'available');
    assert.equal(result.metrics.find(m=>m.key===key)?.value,values[key]);
  }
  assert.equal(result.metrics.find(m=>m.key==='taxi_trip_metrics')?.status,'not_instrumented');

  const anomalies=await service.reviewOperationalAnomalies('operator');
  const resources=new Map(anomalies.findings.map(f=>[f.resource,f]));
  assert.equal(resources.get('classifieds:moderation-backlog')?.source,'canonical_database.ad_listings');
  assert.equal(resources.get('store:moderation-backlog')?.source,'canonical_database.product_listings');
  assert.equal(resources.get('classifieds:expiry-state')?.severity,'low');
  assert.equal(resources.get('taxi:driver-approvals')?.source,'canonical_database.khedmah_taxi.driver_approvals');
  assert.match(resources.get('taxi:driver-approvals')!.evidence,/count=2;/);
  assert.equal(anomalies.automaticDecisionAuthorized,false);
});

test('Kora counts inquiries and provider reports without treating report allegations as confirmed violations',async()=>{
  const values={
    ...DEFAULT_SERVICE_METRICS,
    contact_inquiries_unread_24h:3,
    provider_reports_overdue_24h:2,
    provider_reports_sensitive_open:1
  };
  const service=createService({serviceMetrics:async()=>values});
  const result=await service.readMetrics('operator');
  for(const key of ['contact_inquiries_24h','contact_inquiries_open','provider_reports_open','provider_reports_sensitive_open']) {
    assert.equal(result.metrics.find(m=>m.key===key)?.status,'available');
    assert.equal(result.metrics.find(m=>m.key===key)?.value,values[key]);
  }
  assert.equal(result.metrics.find(m=>m.key==='zero_result_searches_24h')?.status,'not_instrumented');

  const anomalies=await service.reviewOperationalAnomalies('operator');
  const resources=new Map(anomalies.findings.map(f=>[f.resource,f]));
  assert.equal(resources.get('contact:inquiry-backlog')?.source,'canonical_database.contact_inquiries');
  assert.equal(resources.get('reports:moderation-backlog')?.source,'canonical_database.provider_reports');
  assert.equal(resources.get('reports:sensitive-open')?.severity,'medium');
  assert.match(resources.get('reports:sensitive-open')!.summary,/ادعاء/);
  assert.equal(anomalies.automaticDecisionAuthorized,false);
});

test('Kora monitors moderation verification and mobility queues without auto-approving private evidence',async()=>{
  const values={
    ...DEFAULT_SERVICE_METRICS,
    business_profiles_review_overdue_24h:2,
    professional_profiles_review_overdue_24h:1,
    verification_requests_overdue_24h:3,
    mobility_documents_overdue_24h:4
  };
  const service=createService({serviceMetrics:async()=>values});
  const result=await service.readMetrics('operator');
  for(const key of [
    'business_profiles_pending_review','professional_profiles_pending_review',
    'verification_requests_pending','mobility_documents_pending'
  ]) {
    assert.equal(result.metrics.find(m=>m.key===key)?.status,'available');
    assert.equal(result.metrics.find(m=>m.key===key)?.value,values[key]);
  }
  const anomalies=await service.reviewOperationalAnomalies('operator');
  const resources=new Map(anomalies.findings.map(f=>[f.resource,f]));
  assert.equal(resources.get('moderation:business-profiles')?.source,'canonical_database.business_profiles');
  assert.equal(resources.get('moderation:professional-profiles')?.source,'canonical_database.professional_profiles');
  assert.equal(resources.get('verification:requests')?.source,'canonical_database.verification_requests');
  assert.equal(resources.get('mobility:document-review')?.source,'canonical_database.mobility_document_reviews');
  assert.match(resources.get('mobility:document-review')!.summary,/لا يقرأ محتوى الوثيقة/);
  assert.equal(anomalies.automaticDecisionAuthorized,false);
});


test('Kora does not turn a failed service aggregate into zero or a fabricated healthy state',async()=>{
  const service=createService({serviceMetrics:async()=>{throw new Error('DB_UNAVAILABLE');}});
  await assert.rejects(service.readMetrics('operator'),/DB_UNAVAILABLE/);
  await assert.rejects(service.reviewOperationalAnomalies('operator'),/DB_UNAVAILABLE/);
});

test('Kora direct anomaly review remains supervised and records actor-bound audit', async () => {
  const audits: KoraAuditCall[] = [];
  const service = createService({ audits });
  const result = await service.reviewOperationalAnomalies('session=operator');

  assert.equal(result.operatingMode, 'supervised');
  assert.equal(result.automaticDecisionAuthorized, false);
  assert.deepEqual(audits, [{ cookie: 'session=operator', eventType: 'kora.anomalies.reviewed', resource: 'operational-anomalies' }]);
});

test('Kora evaluates supplied UI failure evidence without authorizing an automatic action and audits the observation', async () => {
  const audits: KoraAuditCall[] = [];
  const service = createService({ audits });
  const result = await service.evaluateUiObservation('session=operator', {
    checkId: 'taxi_embedded_map',
    status: 'fail',
    evidence: 'Preview screenshot shows the map missing.'
  });

  assert.equal(result.observedStatus, 'fail');
  assert.equal(result.failure?.kind, 'ui_failure');
  assert.equal(result.failure?.source, 'structured_ui_observation');
  assert.equal(result.automaticActionAuthorized, false);
  assert.deepEqual(audits, [{ cookie: 'session=operator', eventType: 'kora.ui_observation.evaluated', resource: 'taxi_embedded_map' }]);
});

test('KillCritic requires human approval for Production, never auto-executes, and records supervised audit events', async () => {
  const audits: KoraAuditCall[] = [];
  const service = createService({ audits });
  const production = await service.killCritic('session=operator', {
    action: 'deploy a release',
    targetEnvironment: 'production',
    impact: 'medium'
  });
  const preview = await service.killCritic('session=operator', {
    action: 'change copy',
    targetEnvironment: 'preview',
    impact: 'low'
  });

  assert.equal(production.decision, 'human_approval_required');
  assert.equal(production.automaticExecutionAllowed, false);
  assert.equal(preview.decision, 'review_required');
  assert.equal(preview.automaticExecutionAllowed, false);
  assert.deepEqual(audits.map(({ eventType, resource }) => ({ eventType, resource })), [
    { eventType: 'kora.killcritic', resource: 'production:medium' },
    { eventType: 'kora.killcritic', resource: 'preview:low' }
  ]);
});

test('Autopsy keeps root cause undetermined on incomplete evidence and records an audit event', async () => {
  const audits: KoraAuditCall[] = [];
  const service = createService({ audits });
  const result = await service.autopsy('session=operator', {
    title: 'Preview mismatch',
    observedAt: '2026-09-13T07:00:00.000Z',
    summary: 'Rendered evidence did not match the intended source styling.',
    evidence: 'Screenshot and source comparison only.'
  });

  assert.equal(result.rootCause.status, 'undetermined');
  assert.equal(result.automaticExecutionAllowed, false);
  assert.ok(result.nextEvidence.length >= 3);
  assert.deepEqual(audits, [{ cookie: 'session=operator', eventType: 'kora.autopsy', resource: 'root-cause-analysis' }]);
});

test('Expose produces evidence-bound output and records only its composite supervised audit event', async () => {
  const audits: KoraAuditCall[] = [];
  const service = createService({ audits });
  const result = await service.expose('session=operator');

  assert.equal(result.mode, 'expose');
  assert.equal(result.operatingMode, 'supervised');
  assert.equal(result.confirmedUiFailures.length, 0);
  assert.ok(result.telemetryGaps.length > 0);
  assert.deepEqual(audits, [{ cookie: 'session=operator', eventType: 'kora.expose', resource: 'supervised-evidence' }]);
});
