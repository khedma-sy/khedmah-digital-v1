export const OPERATIONS_PRODUCT_ROLES = [
  'operations_product_director', 'infrastructure_manager', 'cloud_administrator', 'devops_engineer',
  'production_engineer', 'release_manager', 'security_operations_engineer', 'site_reliability_engineer'
] as const;
export type OperationsProductRole = typeof OPERATIONS_PRODUCT_ROLES[number];
export type OperationsPermission = 'operations.read' | 'users.manage' | 'orders.monitor' | 'infrastructure.manage' | 'deployments.manage' | 'releases.manage' | 'security.manage' | 'incidents.manage' | 'rbac.manage';
export const ROLE_PERMISSIONS: Readonly<Record<OperationsProductRole, readonly OperationsPermission[]>> = Object.freeze({
  operations_product_director: ['operations.read', 'users.manage', 'orders.monitor', 'infrastructure.manage', 'deployments.manage', 'releases.manage', 'security.manage', 'incidents.manage', 'rbac.manage'],
  infrastructure_manager: ['operations.read', 'infrastructure.manage', 'deployments.manage'],
  cloud_administrator: ['operations.read', 'infrastructure.manage', 'security.manage'],
  devops_engineer: ['operations.read', 'deployments.manage', 'releases.manage'],
  production_engineer: ['operations.read', 'orders.monitor', 'deployments.manage', 'incidents.manage'],
  release_manager: ['operations.read', 'releases.manage'],
  security_operations_engineer: ['operations.read', 'users.manage', 'security.manage', 'incidents.manage'],
  site_reliability_engineer: ['operations.read', 'orders.monitor', 'deployments.manage', 'incidents.manage']
});
export type OperationsArea = 'google-cloud' | 'firebase' | 'ci-cd' | 'production' | 'monitoring' | 'security';
export interface OperationsChange { readonly id: string; readonly area: OperationsArea; readonly action: string; readonly reason: string; readonly status: 'pending_approval'; readonly actorUserId: string; readonly createdAt: string; }
export interface OperationsAuditRecord { readonly id: string; readonly actorUserId: string; readonly action: string; readonly resource: string; readonly occurredAt: string; readonly requestId?: string; readonly correlationId?: string; }
