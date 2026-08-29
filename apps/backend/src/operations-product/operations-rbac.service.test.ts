import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { OperationsRbacService } from './operations-rbac.service';
test('Operations Product RBAC denies access without an explicit binding', () => {
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  assert.throws(() => new OperationsRbacService().assert('user@example.invalid', 'operations.read'), ForbiddenException);
});
test('Operations Product roles grant only their mapped permissions', () => {
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'sre@example.invalid': ['site_reliability_engineer'] });
  const rbac = new OperationsRbacService();
  assert.deepEqual(rbac.assert('SRE@example.invalid', 'incidents.manage'), ['site_reliability_engineer']);
  assert.deepEqual(rbac.permissionsFor('SRE@example.invalid'), ['operations.read', 'deployments.manage', 'incidents.manage']);
  assert.throws(() => rbac.assert('sre@example.invalid', 'security.manage'), ForbiddenException);
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
});
test('unknown role bindings fail closed', () => {
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'user@example.invalid': ['board_member'] });
  assert.throws(() => new OperationsRbacService().assert('user@example.invalid', 'operations.read'), ForbiddenException);
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
});
