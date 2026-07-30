import { ForbiddenException, Injectable } from '@nestjs/common';
import { OPERATIONS_PRODUCT_ROLES, OperationsPermission, OperationsProductRole, ROLE_PERMISSIONS } from './operations-product.types';
@Injectable()
export class OperationsRbacService {
  rolesFor(email: string): readonly OperationsProductRole[] {
    const raw = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
    if (!raw) return [];
    let bindings: unknown;
    try { bindings = JSON.parse(raw); } catch { throw new Error('OPERATIONS_PRODUCT_ROLE_BINDINGS must be valid JSON'); }
    if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) throw new Error('OPERATIONS_PRODUCT_ROLE_BINDINGS must be an object');
    const roles = (bindings as Record<string, unknown>)[email.toLowerCase()];
    if (!Array.isArray(roles) || roles.some(role => !OPERATIONS_PRODUCT_ROLES.includes(role as OperationsProductRole))) return [];
    return roles as OperationsProductRole[];
  }
  assert(email: string, permission: OperationsPermission): readonly OperationsProductRole[] {
    const roles = this.rolesFor(email);
    if (!roles.some(role => ROLE_PERMISSIONS[role].includes(permission))) throw new ForbiddenException('Operations Product access denied.');
    return roles;
  }
}
