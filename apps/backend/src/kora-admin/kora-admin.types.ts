export type KoraMetricStatus = 'available' | 'process_local' | 'not_instrumented';
export type KoraSeverity = 'low' | 'medium' | 'high' | 'critical';
export type KoraMode = 'executive' | 'expose' | 'killcritic' | 'autopsy';

export interface KoraMetric {
  readonly key: string;
  readonly label: string;
  readonly status: KoraMetricStatus;
  readonly source: string;
  readonly window: 'all_time' | '24h' | 'current_process';
  readonly measuredAt: string;
  readonly value?: number;
  readonly note?: string;
}

export interface KoraFinding {
  readonly id: string;
  readonly kind: 'operational_anomaly' | 'ui_failure' | 'telemetry_gap' | 'incident';
  readonly resource: string;
  readonly title: string;
  readonly summary: string;
  readonly severity: KoraSeverity;
  readonly evidence: string;
  readonly source: string;
  readonly detectedAt: string;
}

export interface KoraDraftTask {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: 'P0' | 'P1' | 'P2' | 'P3';
  readonly resource: string;
  readonly sourceFindingKind: KoraFinding['kind'];
  readonly evidence: string;
  readonly suggestedAction: string;
  readonly approvalRequired: boolean;
  readonly autoExecutable: false;
  readonly createdAt: string;
}

export const KORA_UI_CHECKS = Object.freeze([
  { id: 'taxi_embedded_map', label: 'Taxi embedded map', severity: 'high' as const },
  { id: 'taxi_map_navigation', label: 'Taxi map navigation', severity: 'high' as const },
  { id: 'store_navigation', label: 'Store navigation visibility', severity: 'medium' as const },
  { id: 'food_route', label: 'Food route visibility', severity: 'medium' as const },
  { id: 'brand_identity', label: 'Khedmah visual identity consistency', severity: 'medium' as const },
  { id: 'dead_action', label: 'Dead or non-working action', severity: 'high' as const },
  { id: 'missing_page', label: 'Missing page or 404', severity: 'high' as const },
  { id: 'wrong_route', label: 'Wrong route destination', severity: 'high' as const }
]);

export type KoraUiCheckId = typeof KORA_UI_CHECKS[number]['id'];
