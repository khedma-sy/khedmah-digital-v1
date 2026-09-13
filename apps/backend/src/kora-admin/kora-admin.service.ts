import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { OperationsProductService } from '../operations-product/operations-product.service';
import { AutopsyRequest, DraftAdminTaskRequest, EvaluateUiObservationRequest, KillCriticRequest } from './dto/kora-admin.dto';
import { KORA_UI_CHECKS, KoraDraftTask, KoraFinding, KoraMetric, KoraSeverity } from './kora-admin.types';
import { KoraAdminRepository } from './kora-admin.repository';

@Injectable()
export class KoraAdminService {
  constructor(
    @Inject(KoraAdminRepository) private readonly repository: KoraAdminRepository,
    @Inject(OperationsProductService) private readonly operations: OperationsProductService
  ) {}

  async readMetrics(cookie: string | undefined) {
    const measuredAt = new Date().toISOString();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // Authorize before any aggregate database read so an unauthenticated caller
    // cannot cause Kora to inspect administrative metrics as a side effect.
    const history = await this.operations.histories(cookie);
    const [users, searches] = await Promise.all([
      this.repository.countUsers(),
      this.repository.countSearchActionsSince(since)
    ]);

    const metrics: KoraMetric[] = [
      this.availableMetric('users_total', 'Users', users, 'canonical_database.core_user_accounts', 'all_time', measuredAt),
      this.availableMetric('searches_24h', 'Search actions', searches, 'analytics_events.search_action', '24h', measuredAt),
      this.processMetric('open_operational_issues', 'Open operational issues', history.incidents.length, 'operations_product.current_process', measuredAt,
        'Process-local only; it is not a durable incident total across Cloud Run instances.'),
      this.processMetric('pending_changes', 'Pending operational changes', history.changes.length, 'operations_product.current_process', measuredAt,
        'Process-local only; creating a record does not execute a change.'),
      this.unavailableMetric('zero_result_searches_24h', 'Zero-result searches', measuredAt, 'Search result-count telemetry is not instrumented yet.'),
      this.unavailableMetric('orders_24h', 'Orders', measuredAt, 'No canonical cross-product order metric is instrumented.'),
      this.unavailableMetric('cancellations_24h', 'Cancellations', measuredAt, 'No canonical cross-product cancellation metric is instrumented.'),
      this.unavailableMetric('taxi_metrics', 'Taxi metrics', measuredAt, 'Taxi operational metrics are not connected to Kora yet.'),
      this.unavailableMetric('food_metrics', 'Food metrics', measuredAt, 'Food runtime metrics are not instrumented yet.'),
      this.unavailableMetric('delivery_metrics', 'Delivery metrics', measuredAt, 'Delivery runtime metrics are not instrumented yet.'),
      this.unavailableMetric('store_metrics', 'Store metrics', measuredAt, 'Store operational metrics are not connected to Kora yet.'),
      this.unavailableMetric('ads_metrics', 'Ads metrics', measuredAt, 'Classifieds Smart Admin remains separate; aggregate Ads metrics are not connected yet.')
    ];

    return {
      tool: 'read_metrics' as const,
      operatingMode: 'supervised' as const,
      measuredAt,
      windowStart: since,
      metrics,
      truthfulUnavailableValues: true
    };
  }

  async uiChecklist(cookie: string | undefined) {
    await this.authorize(cookie);
    return {
      tool: 'detect_ui_failures' as const,
      operatingMode: 'supervised' as const,
      liveBrowserEvidenceConnected: false,
      checks: KORA_UI_CHECKS.map((check) => ({
        ...check,
        status: 'not_observed' as const,
        evidenceKind: 'runtime_browser_evidence_not_connected' as const,
        note: 'Kora will not claim pass or failure until structured browser/CI evidence is supplied.'
      }))
    };
  }

  async evaluateUiObservation(cookie: string | undefined, input: EvaluateUiObservationRequest) {
    await this.authorize(cookie);
    const check = KORA_UI_CHECKS.find((candidate) => candidate.id === input.checkId);
    if (!check) throw new Error('KORA_UI_CHECK_UNKNOWN');

    const failure: KoraFinding | null = input.status === 'fail' ? {
      id: randomUUID(),
      kind: 'ui_failure',
      resource: check.id,
      title: check.label,
      summary: `Observed UI check failed: ${check.label}.`,
      severity: check.severity,
      evidence: input.evidence,
      source: 'structured_ui_observation',
      detectedAt: new Date().toISOString()
    } : null;

    const result = {
      tool: 'detect_ui_failures' as const,
      checkId: check.id,
      observedStatus: input.status,
      failure,
      automaticActionAuthorized: false
    };
    await this.audit(cookie, 'kora.ui_observation.evaluated', check.id);
    return result;
  }

  async reviewOperationalAnomalies(cookie: string | undefined) {
    const history = await this.operations.histories(cookie);
    const detectedAt = new Date().toISOString();
    const findings: KoraFinding[] = history.incidents
      .filter((incident) => incident.severity === 'high' || incident.severity === 'critical')
      .map((incident) => ({
        id: randomUUID(),
        kind: 'incident' as const,
        resource: `operations-incident:${incident.id}`,
        title: incident.title,
        summary: incident.summary,
        severity: incident.severity as KoraSeverity,
        evidence: `incident_id=${incident.id};created_at=${incident.createdAt};status=${incident.status}`,
        source: 'operations_product.current_process',
        detectedAt
      }));

    return {
      tool: 'review_operational_anomalies' as const,
      operatingMode: 'supervised' as const,
      findings,
      coverageGaps: [
        'cancellation_rate',
        'abnormal_user_activity',
        'duplicate_ads_aggregate',
        'driver_issue_rate',
        'restaurant_issue_rate',
        'api_failure_rate',
        'error_rate_baseline'
      ],
      sourceBoundary: 'Only current-process Operations incidents are evaluated in this first slice; missing telemetry is never interpreted as zero.',
      automaticDecisionAuthorized: false
    };
  }

  async draftAdminTask(cookie: string | undefined, input: DraftAdminTaskRequest): Promise<{ tool: 'draft_admin_tasks'; task: KoraDraftTask }> {
    await this.authorize(cookie);
    const task: KoraDraftTask = {
      id: randomUUID(),
      title: input.title.trim(),
      summary: input.summary.trim(),
      priority: this.priority(input.severity),
      resource: input.resource.trim(),
      sourceFindingKind: input.kind,
      evidence: input.evidence.trim(),
      suggestedAction: this.suggestedAction(input.kind),
      approvalRequired: input.severity === 'high' || input.severity === 'critical',
      autoExecutable: false,
      createdAt: new Date().toISOString()
    };
    await this.audit(cookie, 'kora.task.drafted', input.resource.trim());
    return { tool: 'draft_admin_tasks', task };
  }

  async executive(cookie: string | undefined) {
    const [metrics, anomalies] = await Promise.all([
      this.readMetrics(cookie),
      this.reviewOperationalAnomalies(cookie)
    ]);
    const highestRisk = this.highestRisk(anomalies.findings.map((finding) => finding.severity));
    const result = {
      mode: 'executive' as const,
      operatingMode: 'supervised' as const,
      whatHappened: metrics.metrics.filter((metric) => metric.status !== 'not_instrumented'),
      problemCount: anomalies.findings.length,
      riskLevel: highestRisk,
      recommendations: anomalies.findings.length > 0
        ? ['Review high-risk incident evidence before any operational change.', 'Create explicit admin tasks for confirmed findings.']
        : ['No high/critical process-local incident is confirmed by the currently connected evidence.', 'Close telemetry gaps before drawing conclusions about cancellations or product health.'],
      needsOwnerDecision: anomalies.findings.some((finding) => finding.severity === 'high' || finding.severity === 'critical'),
      evidenceBoundary: anomalies.sourceBoundary
    };
    await this.audit(cookie, 'kora.executive', 'executive-summary');
    return result;
  }

  async expose(cookie: string | undefined) {
    const [ui, metrics] = await Promise.all([this.uiChecklist(cookie), this.readMetrics(cookie)]);
    const result = {
      mode: 'expose' as const,
      operatingMode: 'supervised' as const,
      confirmedUiFailures: [] as KoraFinding[],
      uiChecks: ui.checks,
      telemetryGaps: metrics.metrics.filter((metric) => metric.status === 'not_instrumented'),
      note: 'No live UI failure is claimed without structured browser or CI evidence.'
    };
    await this.audit(cookie, 'kora.expose', 'supervised-evidence');
    return result;
  }

  async killCritic(cookie: string | undefined, input: KillCriticRequest) {
    await this.authorize(cookie);
    const humanApprovalRequired = input.targetEnvironment === 'production' || input.impact === 'high' || input.impact === 'critical';
    const result = {
      mode: 'killcritic' as const,
      operatingMode: 'supervised' as const,
      action: input.action.trim(),
      targetEnvironment: input.targetEnvironment,
      impact: input.impact,
      decision: humanApprovalRequired ? 'human_approval_required' as const : 'review_required' as const,
      questions: [
        'What existing route, contract, or data flow could this change break?',
        'Is there a smaller reversible change that proves the same outcome?',
        'What Preview or Staging evidence will prove the change before promotion?',
        'Does the change affect users, permissions, prices, policies, secrets, or Production?'
      ],
      automaticExecutionAllowed: false
    };
    await this.audit(cookie, 'kora.killcritic', `${input.targetEnvironment}:${input.impact}`);
    return result;
  }

  async autopsy(cookie: string | undefined, input: AutopsyRequest) {
    await this.authorize(cookie);
    const result = {
      mode: 'autopsy' as const,
      operatingMode: 'supervised' as const,
      incident: {
        title: input.title.trim(),
        observedAt: input.observedAt,
        summary: input.summary.trim(),
        evidence: input.evidence.trim()
      },
      rootCause: { status: 'undetermined' as const, reason: 'Kora does not infer a root cause from incomplete evidence.' },
      nextEvidence: [
        'Correlate request IDs and timestamps across backend and frontend evidence.',
        'Identify the first known bad revision or configuration change.',
        'Reproduce in Preview or Staging before proposing a fix.',
        'Compare the failing path with the last known good behavior.'
      ],
      preventionDecision: 'Define prevention only after root-cause evidence is established.',
      automaticExecutionAllowed: false
    };
    await this.audit(cookie, 'kora.autopsy', 'root-cause-analysis');
    return result;
  }

  private async authorize(cookie: string | undefined): Promise<void> {
    await this.operations.overview(cookie);
  }

  private async audit(cookie: string | undefined, eventType: Parameters<OperationsProductService['recordSupervisedAdminAudit']>[1], resource: string): Promise<void> {
    await this.operations.recordSupervisedAdminAudit(cookie, eventType, resource);
  }

  private availableMetric(key: string, label: string, value: number, source: string, window: 'all_time' | '24h', measuredAt: string): KoraMetric {
    return { key, label, value, status: 'available', source, window, measuredAt };
  }

  private processMetric(key: string, label: string, value: number, source: string, measuredAt: string, note: string): KoraMetric {
    return { key, label, value, status: 'process_local', source, window: 'current_process', measuredAt, note };
  }

  private unavailableMetric(key: string, label: string, measuredAt: string, note: string): KoraMetric {
    return { key, label, status: 'not_instrumented', source: 'none', window: '24h', measuredAt, note };
  }

  private priority(severity: KoraSeverity): KoraDraftTask['priority'] {
    if (severity === 'critical') return 'P0';
    if (severity === 'high') return 'P1';
    if (severity === 'medium') return 'P2';
    return 'P3';
  }

  private suggestedAction(kind: KoraFinding['kind']): string {
    if (kind === 'ui_failure') return 'Reproduce in Preview, isolate the route/component, patch the smallest surface, and rerun UI evidence.';
    if (kind === 'operational_anomaly') return 'Confirm the metric source and baseline, isolate the affected workflow, then propose a reversible remediation.';
    if (kind === 'telemetry_gap') return 'Instrument a privacy-safe canonical metric and validate it before using it for decisions.';
    return 'Run Autopsy, preserve evidence, and create a change request only after the root cause is established.';
  }

  private highestRisk(severities: readonly KoraSeverity[]): KoraSeverity {
    const rank: Record<KoraSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    return severities.reduce<KoraSeverity>((current, next) => rank[next] > rank[current] ? next : current, 'low');
  }
}
