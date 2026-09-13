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

function createService(overrides: {
  histories?: () => Promise<{ incidents: Array<Record<string, unknown>>; changes: Array<Record<string, unknown>> }>;
  overview?: () => Promise<unknown>;
  countUsers?: () => Promise<number>;
  countSearchActionsSince?: (since: string) => Promise<number>;
  audits?: KoraAuditCall[];
} = {}) {
  const repository = {
    countUsers: overrides.countUsers ?? (async () => 12),
    countSearchActionsSince: overrides.countSearchActionsSince ?? (async () => 4)
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
  const taxi = result.metrics.find((metric) => metric.key === 'taxi_metrics');
  const food = result.metrics.find((metric) => metric.key === 'food_metrics');

  assert.equal(users?.status, 'available');
  assert.equal(users?.value, 12);
  assert.equal(searches?.status, 'available');
  assert.equal(searches?.value, 4);
  assert.equal(taxi?.status, 'not_instrumented');
  assert.equal(taxi?.value, undefined);
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
