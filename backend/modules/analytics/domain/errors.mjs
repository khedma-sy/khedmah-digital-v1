import { ErrorCategory, KhedmahCoreError } from '../../../core/errors/base-error.mjs';

export const AnalyticsErrorCode = Object.freeze({
  ANALYTICS_INVALID: 'ANALYTICS_INVALID',
  METRIC_INVALID: 'METRIC_INVALID',
  AGGREGATION_INVALID: 'AGGREGATION_INVALID',
  ANALYTICS_SCOPE_INVALID: 'ANALYTICS_SCOPE_INVALID',
  ANALYTICS_VISIBILITY_INVALID: 'ANALYTICS_VISIBILITY_INVALID',
});

export function createAnalyticsError(code, message, metadata = {}) {
  const categoryByCode = {
    [AnalyticsErrorCode.ANALYTICS_INVALID]: ErrorCategory.VALIDATION,
    [AnalyticsErrorCode.METRIC_INVALID]: ErrorCategory.VALIDATION,
    [AnalyticsErrorCode.AGGREGATION_INVALID]: ErrorCategory.VALIDATION,
    [AnalyticsErrorCode.ANALYTICS_SCOPE_INVALID]: ErrorCategory.VALIDATION,
    [AnalyticsErrorCode.ANALYTICS_VISIBILITY_INVALID]: ErrorCategory.VALIDATION,
  };
  return new KhedmahCoreError({ code, message, category: categoryByCode[code] || ErrorCategory.SYSTEM, metadata });
}
