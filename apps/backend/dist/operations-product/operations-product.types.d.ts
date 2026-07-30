export declare const OPERATIONS_PRODUCT_ROLES: readonly ["operations_product_director", "infrastructure_manager", "cloud_administrator", "devops_engineer", "production_engineer", "release_manager", "security_operations_engineer", "site_reliability_engineer"];
export type OperationsProductRole = typeof OPERATIONS_PRODUCT_ROLES[number];
export type OperationsPermission = 'operations.read' | 'infrastructure.manage' | 'deployments.manage' | 'releases.manage' | 'security.manage' | 'incidents.manage' | 'rbac.manage';
export declare const ROLE_PERMISSIONS: Readonly<Record<OperationsProductRole, readonly OperationsPermission[]>>;
export type OperationsArea = 'google-cloud' | 'firebase' | 'ci-cd' | 'production' | 'monitoring' | 'security';
export interface OperationsChange {
    readonly id: string;
    readonly area: OperationsArea;
    readonly action: string;
    readonly reason: string;
    readonly status: 'pending_approval';
    readonly actorUserId: string;
    readonly createdAt: string;
}
export interface OperationsAuditRecord {
    readonly id: string;
    readonly actorUserId: string;
    readonly action: string;
    readonly resource: string;
    readonly occurredAt: string;
    readonly requestId?: string;
    readonly correlationId?: string;
}
