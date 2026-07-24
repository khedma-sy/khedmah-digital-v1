import { combineValidationResults, validateAllowedValue, validatePattern, validateRequiredFields } from '../../../core/validation/validators.mjs';
import { AggregationLevel, AnalyticsPrivacyClassification, AnalyticsScope, MetricType, METRIC_NAME_PATTERN, REQUIRED_METRIC_FIELDS } from '../domain/analytics-types.mjs';
import { validateAnalyticsPrivacySafety } from '../domain/privacy-policy.mjs';
import { AnalyticsVisibility, validateAnalyticsVisibilityExposure } from '../domain/visibility.mjs';

const aggregationLevels = Object.freeze(Object.values(AggregationLevel));
const analyticsScopes = Object.freeze(Object.values(AnalyticsScope));
const analyticsVisibilities = Object.freeze(Object.values(AnalyticsVisibility));
const metricTypes = Object.freeze(Object.values(MetricType));
const privacyClassifications = Object.freeze(Object.values(AnalyticsPrivacyClassification));

export function validateMetricDefinition(input) {
  const value = input || {};
  return combineValidationResults(
    validateRequiredFields(value, REQUIRED_METRIC_FIELDS),
    validatePattern('metricName', value.metricName, METRIC_NAME_PATTERN, 'metricName must be a safe lowercase snake_case metric identifier.'),
    validateAllowedValue('metricType', value.metricType, metricTypes),
    validateAllowedValue('aggregationLevel', value.aggregationLevel, aggregationLevels),
    validateAllowedValue('visibility', value.visibility, analyticsVisibilities),
    validateAllowedValue('scope', value.scope, analyticsScopes),
    validateAllowedValue('privacyClassification', value.privacyClassification, privacyClassifications),
    validateAnalyticsPrivacySafety(value),
    validateAnalyticsVisibilityExposure({ visibility: value.visibility, exposesPrivateAnalytics: value.exposesPrivateAnalytics, exposesPersonalData: value.exposesPersonalData, enablesPersonalRanking: value.enablesPersonalRanking, enablesCompetitorAbuse: value.enablesCompetitorAbuse }),
  );
}

export { aggregationLevels as APPROVED_AGGREGATION_LEVELS, analyticsScopes as APPROVED_ANALYTICS_SCOPES, analyticsVisibilities as APPROVED_ANALYTICS_VISIBILITIES, metricTypes as APPROVED_METRIC_TYPES, privacyClassifications as APPROVED_ANALYTICS_PRIVACY_CLASSIFICATIONS };
