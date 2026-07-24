export const DatabaseLayerBoundary = Object.freeze({
  BELOW_REPOSITORY_LAYER: true,
  BELOW_DOMAIN_LAYER: true,
  BELOW_APPLICATION_LAYER: true,
  BELOW_API_LAYER: true,
  API_DIRECT_DATABASE_ACCESS_ALLOWED: false,
  BUSINESS_LOGIC_IN_DATABASE_LAYER_ALLOWED: false,
});

export const ForbiddenDatabaseTableScope = Object.freeze({
  MARKETPLACE_TABLES: 'marketplace_tables',
  PAYMENT_TABLES: 'payment_tables',
  ORDER_TABLES: 'order_tables',
  COMMISSION_TABLES: 'commission_tables',
  ADVERTISING_TABLES: 'advertising_tables',
  RANKING_TABLES: 'ranking_tables',
  SOCIAL_GRAPH_TABLES: 'social_graph_tables',
  TRACKING_TABLES: 'tracking_tables',
  USER_TABLES: 'user_tables',
  PROFILE_TABLES: 'profile_tables',
  ORGANIZATION_TABLES: 'organization_tables',
  SERVICE_TABLES: 'service_tables',
});

export function assertNoBusinessTableDefinitions(content = '') {
  const forbiddenPatterns = [/CREATE\s+TABLE/i, /users?\s*\(/i, /profiles?\s*\(/i, /organizations?\s*\(/i, /services?\s*\(/i, /payments?\s*\(/i, /orders?\s*\(/i, /marketplace/i, /tracking/i];
  const violations = forbiddenPatterns.filter((pattern) => pattern.test(content)).map((pattern) => pattern.source);
  return Object.freeze({ valid: violations.length === 0, violations: Object.freeze(violations) });
}
