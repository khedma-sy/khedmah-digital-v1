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
  assert.throws(() => rbac.assert('sre@example.invalid', 'ai.manage'), ForbiddenException);
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
});
test('only the operations product director can manage the AI control plane', () => {
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'owner@example.invalid': ['operations_product_director'] });
  const rbac = new OperationsRbacService();
  assert.deepEqual(rbac.assert('OWNER@example.invalid', 'ai.manage'), ['operations_product_director']);
  assert.ok(rbac.permissionsFor('owner@example.invalid').includes('ai.manage'));
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
});
test('unknown role bindings fail closed', () => {
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'user@example.invalid': ['board_member'] });
  assert.throws(() => new OperationsRbacService().assert('user@example.invalid', 'operations.read'), ForbiddenException);
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
});
