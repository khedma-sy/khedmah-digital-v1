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
    const result = await this.readMetricsInternal(cookie);
    await this.audit(cookie, 'kora.metrics.read', 'operational-metrics');
    return result;
  }

  async uiChecklist(cookie: string | undefined) {
    const result = await this.uiChecklistInternal(cookie);
    await this.audit(cookie, 'kora.ui_checklist.read', 'ui-readiness-checklist');
    return result;
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
    const result = await this.reviewOperationalAnomaliesInternal(cookie);
    await this.audit(cookie, 'kora.anomalies.reviewed', 'operational-anomalies');
    return result;
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
      this.readMetricsInternal(cookie),
      this.reviewOperationalAnomaliesInternal(cookie)
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
    const [ui, metrics] = await Promise.all([
      this.uiChecklistInternal(cookie),
      this.readMetricsInternal(cookie)
    ]);
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

  private async readMetricsInternal(cookie: string | undefined) {
    const measuredAt = new Date().toISOString();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // Authorize before any aggregate database read so an unauthenticated caller
    // cannot cause Kora to inspect administrative metrics as a side effect.
    const history = await this.operations.histories(cookie);
    const [users, searches, serviceMetrics] = await Promise.all([
      this.repository.countUsers(),
      this.repository.countSearchActionsSince(since),
      this.repository.serviceMetrics(since)
    ]);

    const metrics: KoraMetric[] = [
      this.availableMetric('users_total', 'Users', users, 'canonical_database.core_user_accounts', 'all_time', measuredAt),
      this.availableMetric('searches_24h', 'Search actions', searches, 'analytics_events.search_action', '24h', measuredAt),
      ...this.platformMetrics(serviceMetrics, measuredAt),
      this.processMetric('open_operational_issues', 'Open operational issues', history.incidents.length, 'operations_product.current_process', measuredAt,
        'Process-local only; it is not a durable incident total across Cloud Run instances.'),
      this.processMetric('pending_changes', 'Pending operational changes', history.changes.length, 'operations_product.current_process', measuredAt,
        'Process-local only; creating a record does not execute a change.'),
      this.unavailableMetric('zero_result_searches_24h', 'Zero-result searches', measuredAt, 'Search result-count telemetry is not instrumented yet.'),
      this.unavailableMetric('orders_24h', 'Orders', measuredAt, 'No canonical cross-product order metric is instrumented.'),
      this.unavailableMetric('cancellations_24h', 'Cancellations', measuredAt, 'No canonical cross-product cancellation metric is instrumented.'),
      this.unavailableMetric('taxi_trip_metrics', 'رحلات التكسي', measuredAt, 'Trip lifecycle metrics are intentionally not connected while the Taxi trip runtime remains feature-gated.'),
      this.unavailableMetric('food_metrics', 'جودة المطاعم وزمن التحضير', measuredAt, 'Order counts are measured separately; preparation-time and complaint metrics are not instrumented.'),
      this.unavailableMetric('delivery_metrics', 'جودة التوصيل ومدة الرحلة', measuredAt, 'Assignment backlog is measured separately; delivery-time and driver-issue metrics are not instrumented.'),
      this.unavailableMetric('store_conversion_metrics', 'تحويلات المتجر', measuredAt, 'The Store is listing/discovery only; no purchase conversion metric exists.'),
      this.unavailableMetric('ads_duplicate_metrics', 'الإعلانات المكررة', measuredAt, 'Duplicate-ad aggregate detection is not instrumented yet.')
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

  private async uiChecklistInternal(cookie: string | undefined) {
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

  private async reviewOperationalAnomaliesInternal(cookie: string | undefined) {
    const history = await this.operations.histories(cookie);
    const detectedAt = new Date().toISOString();
    const serviceMetrics = await this.repository.serviceMetrics(new Date(Date.now()-24*60*60*1000).toISOString());
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

    if (serviceMetrics.delivery_assignment_overdue > 0) findings.push({
      id: randomUUID(), kind: 'operational_anomaly', resource: 'fulfillment:delivery-assignment',
      title: 'طلبات مؤكدة تنتظر تعيين مندوب',
      summary: `${serviceMetrics.delivery_assignment_overdue} طلبًا تجاوزت 15 دقيقة منذ تأكيدها دون تعيين مندوب. راجع توفر المندوبين مع أصحاب المنشآت.`,
      severity: 'medium', evidence: `count=${serviceMetrics.delivery_assignment_overdue};status=merchant_confirmed;updated_at_older_than=15m;measured_at=${detectedAt}`,
      source: 'canonical_database.fulfillment_orders', detectedAt
    });
    if (serviceMetrics.ads_review_overdue_24h > 0) findings.push({
      id: randomUUID(), kind: 'operational_anomaly', resource: 'classifieds:moderation-backlog',
      title: 'إعلانات تنتظر المراجعة منذ أكثر من 24 ساعة',
      summary: `${serviceMetrics.ads_review_overdue_24h} إعلانًا ما زال في قائمة المراجعة بعد 24 ساعة. هذه إشارة تشغيلية للمراجعة وليست وعد SLA للمستخدم.`,
      severity: 'medium', evidence: `count=${serviceMetrics.ads_review_overdue_24h};status=pending_review;submitted_at_older_than=24h;measured_at=${detectedAt}`,
      source: 'canonical_database.ad_listings', detectedAt
    });
    if (serviceMetrics.store_review_overdue_24h > 0) findings.push({
      id: randomUUID(), kind: 'operational_anomaly', resource: 'store:moderation-backlog',
      title: 'منتجات تنتظر المراجعة منذ أكثر من 24 ساعة',
      summary: `${serviceMetrics.store_review_overdue_24h} منتجًا نشطًا ما زال بانتظار قرار المراجعة بعد 24 ساعة. هذه إشارة تشغيلية وليست وعد SLA.`,
      severity: 'medium', evidence: `count=${serviceMetrics.store_review_overdue_24h};moderation_status=pending;updated_at_older_than=24h;measured_at=${detectedAt}`,
      source: 'canonical_database.product_listings', detectedAt
    });
    if (serviceMetrics.ads_expired_active > 0) findings.push({
      id: randomUUID(), kind: 'operational_anomaly', resource: 'classifieds:expiry-state',
      title: 'إعلانات منتهية ما زالت بحالة Active',
      summary: `${serviceMetrics.ads_expired_active} إعلانًا تجاوز تاريخ انتهاء الصلاحية مع بقاء الحالة Active. الواجهة العامة تستبعدها، لكن الحالة تحتاج تنظيفًا تشغيليًا.`,
      severity: 'low', evidence: `count=${serviceMetrics.ads_expired_active};status=active;expires_at_lte_now=true;measured_at=${detectedAt}`,
      source: 'canonical_database.ad_listings', detectedAt
    });
    if (serviceMetrics.taxi_expiring_approvals_7d > 0) findings.push({
      id: randomUUID(), kind: 'operational_anomaly', resource: 'taxi:driver-approvals',
      title: 'اعتمادات سائقي تكسي تقترب من الانتهاء',
      summary: `${serviceMetrics.taxi_expiring_approvals_7d} اعتمادًا فعالًا سينتهي خلال 7 أيام. راجع الوثائق قبل انتهاء الصلاحية.`,
      severity: 'low', evidence: `count=${serviceMetrics.taxi_expiring_approvals_7d};status=approved;expires_within=7d;measured_at=${detectedAt}`,
      source: 'canonical_database.khedmah_taxi.driver_approvals', detectedAt
    });

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
        'taxi_trip_lifecycle',
        'api_failure_rate',
        'error_rate_baseline'
      ],
      sourceBoundary: 'Current-process Operations incidents plus canonical fulfillment, Classifieds, Store and Taxi approval state are evaluated. The 15-minute delivery, 24-hour moderation and 7-day approval-expiry thresholds are operational review signals, not user-facing SLAs; missing telemetry is never interpreted as zero.',
      automaticDecisionAuthorized: false
    };
  }

  private platformMetrics(values: Record<string,number>, measuredAt: string): KoraMetric[] {
    const definitions: Array<[string,string,string,KoraMetric['window']]> = [
      ['fulfillment_orders_24h','طلبات التنفيذ خلال 24 ساعة','fulfillment_orders','created_last_24h'],
      ['food_orders_24h','طلبات الطعام خلال 24 ساعة','fulfillment_orders.vertical=food','created_last_24h'],
      ['fulfillment_cancellations_24h','الملغى من طلبات آخر 24 ساعة','fulfillment_orders.status=cancelled','created_last_24h'],
      ['delivery_waiting_assignment','طلبات مؤكدة تنتظر مندوبًا','fulfillment_orders.status=merchant_confirmed','current'],
      ['delivery_assignment_overdue','طلبات تنتظر مندوبًا أكثر من 15 دقيقة','fulfillment_orders.updated_at','current'],
      ['billing_pending_orders','طلبات اشتراك بانتظار السداد','billing_purchase_orders.status=pending','current'],
      ['billing_paid_orders_24h','اشتراكات أُكد سدادها خلال 24 ساعة','billing_purchase_orders.paid_at','paid_last_24h'],
      ['ads_active','إعلانات فعالة','ad_listings.status=active','current'],
      ['ads_pending_review','إعلانات بانتظار المراجعة','ad_listings.status=pending_review','current'],
      ['ads_review_overdue_24h','إعلانات تنتظر المراجعة أكثر من 24 ساعة','ad_listings.submitted_at','current'],
      ['ads_expired_active','إعلانات منتهية ما زالت Active','ad_listings.expires_at','current'],
      ['store_active_products','منتجات متجر منشورة','product_listings.active+approved','current'],
      ['store_pending_review','منتجات بانتظار المراجعة','product_listings.moderation_status=pending','current'],
      ['store_review_overdue_24h','منتجات تنتظر المراجعة أكثر من 24 ساعة','product_listings.updated_at','current'],
      ['store_out_of_stock','منتجات غير متوفرة حاليًا','product_listings.availability=out_of_stock','current'],
      ['taxi_approved_drivers','سائقو تكسي باعتماد فعال','khedmah_taxi.driver_approvals.approved','current'],
      ['taxi_restricted_drivers','سائقو تكسي موقوفون أو ملغاة اعتماداتهم','khedmah_taxi.driver_approvals.restricted','current'],
      ['taxi_expiring_approvals_7d','اعتمادات تكسي تنتهي خلال 7 أيام','khedmah_taxi.driver_approvals.expires_at','current']
    ];
    return definitions.map(([key,label,source,window])=>{
      const value=values[key];
      if(!Number.isSafeInteger(value)||value<0)throw new Error('KORA_SERVICE_METRIC_INVALID');
      return this.availableMetric(key,label,value,`canonical_database.${source}`,window,measuredAt);
    });
  }

  private async authorize(cookie: string | undefined): Promise<void> {
    await this.operations.overview(cookie);
  }

  private async audit(cookie: string | undefined, eventType: Parameters<OperationsProductService['recordSupervisedAdminAudit']>[1], resource: string): Promise<void> {
    await this.operations.recordSupervisedAdminAudit(cookie, eventType, resource);
  }

  private availableMetric(key: string, label: string, value: number, source: string, window: KoraMetric['window'], measuredAt: string): KoraMetric {
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
