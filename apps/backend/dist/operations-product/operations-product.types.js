"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = exports.OPERATIONS_PRODUCT_ROLES = void 0;
exports.OPERATIONS_PRODUCT_ROLES = [
    'operations_product_director', 'infrastructure_manager', 'cloud_administrator', 'devops_engineer',
    'production_engineer', 'release_manager', 'security_operations_engineer', 'site_reliability_engineer'
];
exports.ROLE_PERMISSIONS = Object.freeze({
    operations_product_director: ['operations.read', 'infrastructure.manage', 'deployments.manage', 'releases.manage', 'security.manage', 'incidents.manage', 'rbac.manage'],
    infrastructure_manager: ['operations.read', 'infrastructure.manage', 'deployments.manage'],
    cloud_administrator: ['operations.read', 'infrastructure.manage', 'security.manage'],
    devops_engineer: ['operations.read', 'deployments.manage', 'releases.manage'],
    production_engineer: ['operations.read', 'deployments.manage', 'incidents.manage'],
    release_manager: ['operations.read', 'releases.manage'],
    security_operations_engineer: ['operations.read', 'security.manage', 'incidents.manage'],
    site_reliability_engineer: ['operations.read', 'deployments.manage', 'incidents.manage']
});
//# sourceMappingURL=operations-product.types.js.map