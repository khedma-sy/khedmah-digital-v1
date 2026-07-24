export const AnalyticsConcept = Object.freeze({
  ANALYTICS_EVENT_REFERENCE: 'Analytics Event Reference',
  METRIC_DEFINITION: 'Metric Definition',
  AGGREGATION_RULE: 'Aggregation Rule',
  INSIGHT_REFERENCE: 'Insight Reference',
  ANALYTICS_SCOPE: 'Analytics Scope',
  ANALYTICS_VISIBILITY: 'Analytics Visibility',
});

export const AnalyticsPrincipleFlow = Object.freeze([
  'Platform Activity',
  'Privacy-Aware Aggregation',
  'Service Demand Insight',
  'Geographic Opportunity',
  'Provider Network Growth',
  'Expansion Decision Support',
]);

export const AnalyticsCategory = Object.freeze({
  SERVICE_DEMAND_ANALYTICS: 'service_demand_analytics',
  SEARCH_INTELLIGENCE: 'search_intelligence',
  CATEGORY_GROWTH_ANALYTICS: 'category_growth_analytics',
  LOCATION_OPPORTUNITY_ANALYTICS: 'location_opportunity_analytics',
  PROVIDER_NETWORK_ANALYTICS: 'provider_network_analytics',
  PLATFORM_GROWTH_ANALYTICS: 'platform_growth_analytics',
});

export const MetricType = Object.freeze({
  SERVICE_DEMAND_LEVEL: 'service_demand_level',
  CATEGORY_GROWTH: 'category_growth',
  AREA_DEMAND: 'area_demand',
  PROVIDER_COUNT: 'provider_count',
});

export const AggregationLevel = Object.freeze({
  PLATFORM: 'platform',
  CATEGORY: 'category',
  SERVICE: 'service',
  COUNTRY: 'country',
  CITY: 'city',
  AREA: 'area',
  PROVIDER_NETWORK: 'provider_network',
});

export const AnalyticsScope = Object.freeze({
  SERVICE_DEMAND: 'service_demand',
  SEARCH_INTELLIGENCE: 'search_intelligence',
  CATEGORY_GROWTH: 'category_growth',
  LOCATION_OPPORTUNITY: 'location_opportunity',
  PROVIDER_NETWORK: 'provider_network',
  PLATFORM_GROWTH: 'platform_growth',
});

export const AnalyticsPrivacyClassification = Object.freeze({
  AGGREGATED_STATISTICS: 'aggregated_statistics',
  ANONYMOUS_PATTERNS: 'anonymous_patterns',
  GENERAL_DEMAND_TRENDS: 'general_demand_trends',
});

export const ANALYTICS_REFERENCE_PATTERN = /^(analytics_event|metric|insight|service|category|location|provider_network|platform):[a-z0-9][a-z0-9:_-]{1,120}$/;
export const METRIC_NAME_PATTERN = /^[a-z][a-z0-9_]{2,80}$/;
export const REQUIRED_METRIC_FIELDS = Object.freeze(['metricName', 'metricType', 'aggregationLevel', 'visibility', 'purpose', 'scope', 'privacyClassification']);
