import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ErrorCategory, KhedmahCoreError } from '../backend/core/errors/base-error.mjs';
import { AnalyticsAuditEvent, isAnalyticsAuditEventName } from '../backend/modules/analytics/domain/audit-events.mjs';
import { AggregationLevel, AnalyticsCategory, AnalyticsConcept, AnalyticsPrincipleFlow, AnalyticsPrivacyClassification, AnalyticsScope, MetricType } from '../backend/modules/analytics/domain/analytics-types.mjs';
import { AnalyticsErrorCode, createAnalyticsError } from '../backend/modules/analytics/domain/errors.mjs';
import { AnalyticsPrivacyRule, validateAnalyticsPrivacySafety } from '../backend/modules/analytics/domain/privacy-policy.mjs';
import { AnalyticsSecurityPolicy } from '../backend/modules/analytics/domain/security-policy.mjs';
import { AnalyticsVisibility, AnalyticsVisibilityRule, validateAnalyticsVisibilityExposure } from '../backend/modules/analytics/domain/visibility.mjs';
import { APPROVED_AGGREGATION_LEVELS, APPROVED_ANALYTICS_PRIVACY_CLASSIFICATIONS, APPROVED_ANALYTICS_SCOPES, APPROVED_ANALYTICS_VISIBILITIES, APPROVED_METRIC_TYPES, validateMetricDefinition } from '../backend/modules/analytics/schemas/analytics-validation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const validMetric = Object.freeze({
  metricName: 'service_demand_level',
  metricType: MetricType.SERVICE_DEMAND_LEVEL,
  aggregationLevel: AggregationLevel.AREA,
  visibility: AnalyticsVisibility.INTERNAL,
  purpose: 'Support aggregated service demand decisions.',
  scope: AnalyticsScope.SERVICE_DEMAND,
  privacyClassification: AnalyticsPrivacyClassification.AGGREGATED_STATISTICS,
});

test('analytics module structure follows Mission 050 folder governance', async () => {
  const entries = await readdir(new URL('../backend/modules/analytics/', import.meta.url), { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ['api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
});

test('analytics concepts define event references metrics aggregation insights scope and visibility', () => {
  assert.equal(AnalyticsConcept.ANALYTICS_EVENT_REFERENCE, 'Analytics Event Reference');
  assert.equal(AnalyticsConcept.METRIC_DEFINITION, 'Metric Definition');
  assert.equal(AnalyticsConcept.AGGREGATION_RULE, 'Aggregation Rule');
  assert.equal(AnalyticsConcept.INSIGHT_REFERENCE, 'Insight Reference');
  assert.equal(AnalyticsConcept.ANALYTICS_SCOPE, 'Analytics Scope');
  assert.equal(AnalyticsConcept.ANALYTICS_VISIBILITY, 'Analytics Visibility');
});

test('analytics principles preserve aggregated decision support flow', () => {
  assert.deepEqual(AnalyticsPrincipleFlow, ['Platform Activity', 'Privacy-Aware Aggregation', 'Service Demand Insight', 'Geographic Opportunity', 'Provider Network Growth', 'Expansion Decision Support']);
});

test('supported analytics categories remain reference-only foundations', () => {
  assert.deepEqual(Object.values(AnalyticsCategory), ['service_demand_analytics', 'search_intelligence', 'category_growth_analytics', 'location_opportunity_analytics', 'provider_network_analytics', 'platform_growth_analytics']);
});

test('metric definitions support approved metric types aggregation levels scope visibility and privacy classes', () => {
  assert.deepEqual(APPROVED_METRIC_TYPES, Object.values(MetricType));
  assert.deepEqual(APPROVED_AGGREGATION_LEVELS, Object.values(AggregationLevel));
  assert.deepEqual(APPROVED_ANALYTICS_SCOPES, Object.values(AnalyticsScope));
  assert.deepEqual(APPROVED_ANALYTICS_VISIBILITIES, Object.values(AnalyticsVisibility));
  assert.deepEqual(APPROVED_ANALYTICS_PRIVACY_CLASSIFICATIONS, Object.values(AnalyticsPrivacyClassification));
  assert.equal(validateMetricDefinition(validMetric).valid, true);
});

test('analytics privacy rules allow aggregate patterns and reject personal tracking fields', () => {
  assert.equal(AnalyticsPrivacyRule.allowsAggregatedStatistics, true);
  assert.equal(AnalyticsPrivacyRule.allowsAnonymousPatterns, true);
  assert.equal(AnalyticsPrivacyRule.allowsGeneralDemandTrends, true);
  assert.equal(AnalyticsPrivacyRule.forbidsIndividualUserTracking, true);
  assert.equal(AnalyticsPrivacyRule.forbidsPersonalBehaviorProfiles, true);
  assert.equal(AnalyticsPrivacyRule.forbidsSellingUserData, true);
  assert.equal(AnalyticsPrivacyRule.forbidsSurveillance, true);
  assert.equal(AnalyticsPrivacyRule.forbidsPrivateActivityExposure, true);
  assert.equal(validateAnalyticsPrivacySafety({ userId: 'never', trackingId: 'never', personalProfileRef: 'never' }).valid, false);
});

test('analytics visibility prevents private analytics personal exposure ranking and competitor abuse', () => {
  assert.deepEqual(AnalyticsVisibilityRule.public, []);
  assert.ok(AnalyticsVisibilityRule.internal.includes('aggregatedOperationalInsightRef'));
  assert.equal(validateAnalyticsVisibilityExposure({ visibility: AnalyticsVisibility.INTERNAL }).valid, true);
  assert.equal(validateAnalyticsVisibilityExposure({ visibility: AnalyticsVisibility.PUBLIC, exposesPrivateAnalytics: true }).valid, false);
  assert.equal(validateAnalyticsVisibilityExposure({ visibility: AnalyticsVisibility.PRIVATE, exposesPersonalData: true }).valid, false);
  assert.equal(validateAnalyticsVisibilityExposure({ visibility: AnalyticsVisibility.INTERNAL, enablesPersonalRanking: true }).valid, false);
  assert.equal(validateAnalyticsVisibilityExposure({ visibility: AnalyticsVisibility.INTERNAL, enablesCompetitorAbuse: true }).valid, false);
});

test('analytics validation rejects invalid metric real-user and unsafe privacy data', () => {
  const invalid = validateMetricDefinition({ metricName: 'Bad Metric', metricType: 'user_profile', aggregationLevel: 'individual', visibility: 'public', scope: 'tracking', privacyClassification: 'personal_profile', userId: 'never', exposesPrivateAnalytics: true });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.field === 'metricName'));
  assert.ok(invalid.errors.some((error) => error.field === 'metricType'));
  assert.ok(invalid.errors.some((error) => error.field === 'aggregationLevel'));
  assert.ok(invalid.errors.some((error) => error.field === 'scope'));
  assert.ok(invalid.errors.some((error) => error.field === 'privacyClassification'));
  assert.ok(invalid.errors.some((error) => error.field === 'userId'));
});

test('analytics errors are compatible with Mission 052 core errors without API responses', () => {
  for (const code of Object.values(AnalyticsErrorCode)) {
    const error = createAnalyticsError(code, 'Invalid analytics foundation.');
    assert.ok(error instanceof KhedmahCoreError);
    assert.equal(error.category, ErrorCategory.VALIDATION);
  }
});

test('analytics audit compatibility defines future audit events without storage', () => {
  assert.equal(AnalyticsAuditEvent.ANALYTICS_DEFINITION_CREATED, 'ANALYTICS_DEFINITION_CREATED');
  assert.equal(AnalyticsAuditEvent.ANALYTICS_DEFINITION_UPDATED, 'ANALYTICS_DEFINITION_UPDATED');
  assert.equal(AnalyticsAuditEvent.METRIC_CONFIGURATION_CHANGED, 'METRIC_CONFIGURATION_CHANGED');
  assert.ok(Object.values(AnalyticsAuditEvent).every(isAnalyticsAuditEventName));
});

test('dependency restrictions exclude forbidden modules and implementation layers', async () => {
  const files = [
    'backend/modules/analytics/domain/analytics-types.mjs',
    'backend/modules/analytics/domain/audit-events.mjs',
    'backend/modules/analytics/domain/privacy-policy.mjs',
    'backend/modules/analytics/domain/security-policy.mjs',
    'backend/modules/analytics/domain/visibility.mjs',
    'backend/modules/analytics/domain/errors.mjs',
    'backend/modules/analytics/schemas/analytics-validation.mjs',
  ];
  const content = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(content, /from ['"].*(payments|marketplace|advertising|ai_systems|tracking_systems|frontend|apps\/backend)/i);
  assert.doesNotMatch(content, /controller|route handler|migration|ORM model|database connection/i);
});

test('security boundaries prevent sensitive data storage and forbidden analytics implementations', () => {
  assert.equal(AnalyticsSecurityPolicy.separateFromAudit, true);
  assert.equal(AnalyticsSecurityPolicy.separateFromLogging, true);
  assert.equal(AnalyticsSecurityPolicy.separateFromTracking, true);
  assert.equal(AnalyticsSecurityPolicy.separateFromPersonalProfiling, true);
  assert.equal(AnalyticsSecurityPolicy.storesPrivateUserData, false);
  assert.equal(AnalyticsSecurityPolicy.storesTrackingIdentifiers, false);
  assert.equal(AnalyticsSecurityPolicy.storesSecretsTokensCredentials, false);
});

test('analytics foundation preserves KILL CRITICAL exclusions', async () => {
  const readme = await read('backend/modules/analytics/README.md');
  assert.equal(AnalyticsSecurityPolicy.implementsUserSurveillance, false);
  assert.equal(AnalyticsSecurityPolicy.implementsPersonalTracking, false);
  assert.equal(AnalyticsSecurityPolicy.implementsDataSelling, false);
  assert.equal(AnalyticsSecurityPolicy.implementsAdvertisingAnalytics, false);
  assert.equal(AnalyticsSecurityPolicy.implementsRankingManipulation, false);
  assert.equal(AnalyticsSecurityPolicy.implementsAiRecommendationEngine, false);
  assert.equal(AnalyticsSecurityPolicy.implementsSocialAnalytics, false);
  assert.equal(AnalyticsSecurityPolicy.implementsCompetitorMonitoring, false);
  assert.match(readme, /user surveillance/);
  assert.match(readme, /personal tracking/);
  assert.match(readme, /data selling/);
  assert.match(readme, /advertising analytics/);
  assert.match(readme, /ranking manipulation/);
  assert.match(readme, /AI recommendation engines/);
  assert.match(readme, /social analytics/);
  assert.match(readme, /competitor monitoring/);
});
