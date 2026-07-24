export const AnalyticsAuditEvent = Object.freeze({
  ANALYTICS_DEFINITION_CREATED: 'ANALYTICS_DEFINITION_CREATED',
  ANALYTICS_DEFINITION_UPDATED: 'ANALYTICS_DEFINITION_UPDATED',
  METRIC_CONFIGURATION_CHANGED: 'METRIC_CONFIGURATION_CHANGED',
});

export function isAnalyticsAuditEventName(value) {
  return Object.values(AnalyticsAuditEvent).includes(value) && /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value);
}
