export const AnalyticsVisibility = Object.freeze({
  PUBLIC: 'public',
  PRIVATE: 'private',
  INTERNAL: 'internal',
});

export const AnalyticsVisibilityRule = Object.freeze({
  public: Object.freeze([]),
  private: Object.freeze(['ownerSafeAggregateRef']),
  internal: Object.freeze(['aggregatedOperationalInsightRef', 'metricDefinitionRef', 'insightReference']),
});

export function validateAnalyticsVisibilityExposure({ visibility, exposesPrivateAnalytics = false, exposesPersonalData = false, enablesPersonalRanking = false, enablesCompetitorAbuse = false } = {}) {
  const errors = [];
  if (!Object.values(AnalyticsVisibility).includes(visibility)) errors.push({ field: 'visibility', code: 'ANALYTICS_VISIBILITY_INVALID', message: 'Analytics visibility is unsupported.' });
  if (visibility === AnalyticsVisibility.PUBLIC && exposesPrivateAnalytics) errors.push({ field: 'visibility', code: 'ANALYTICS_VISIBILITY_INVALID', message: 'Public analytics must not expose private analytics.' });
  if (visibility === AnalyticsVisibility.PRIVATE && exposesPersonalData) errors.push({ field: 'visibility', code: 'ANALYTICS_PERSONAL_EXPOSURE_FORBIDDEN', message: 'Private analytics must not expose personal data.' });
  if (enablesPersonalRanking || enablesCompetitorAbuse) errors.push({ field: 'visibility', code: 'ANALYTICS_ABUSE_RISK_FORBIDDEN', message: 'Analytics visibility must not enable personal ranking or competitor abuse.' });
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
