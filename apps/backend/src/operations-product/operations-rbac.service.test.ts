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
test('Smart Admin approver receives only the three human approval authorities', () => {
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({
    'approver@example.invalid': ['smart_admin_approver']
  });
  const rbac = new OperationsRbacService();
  assert.deepEqual(rbac.permissionsFor('APPROVER@example.invalid'), [
    'content.approvals.approve',
    'trust.approvals.approve',
    'mobility.approvals.approve'
  ]);
  for (const permission of [
    'content.approvals.approve',
    'trust.approvals.approve',
    'mobility.approvals.approve'
  ] as const) {
    assert.deepEqual(rbac.assert('approver@example.invalid', permission), ['smart_admin_approver']);
  }
  for (const forbidden of [
    'operations.read',
    'security.manage',
    'infrastructure.manage',
    'deployments.manage',
    'releases.manage',
    'incidents.manage',
    'rbac.manage'
  ] as const) {
    assert.throws(() => rbac.assert('approver@example.invalid', forbidden), ForbiddenException);
  }
  assert.equal(rbac.permissionsFor('approver@example.invalid').some((permission) =>
    /billing|finance|iam|secret|production/i.test(permission)), false);
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
});
test('assertAny accepts one explicit domain authority and fails closed otherwise', () => {
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({
    'approver@example.invalid': ['smart_admin_approver'],
    'sre@example.invalid': ['site_reliability_engineer']
  });
  const rbac = new OperationsRbacService();
  assert.deepEqual(rbac.assertAny('approver@example.invalid', [
    'security.manage',
    'content.approvals.approve'
  ]), ['smart_admin_approver']);
  assert.throws(() => rbac.assertAny('sre@example.invalid', [
    'security.manage',
    'content.approvals.approve'
  ]), ForbiddenException);
  assert.throws(() => rbac.assertAny('approver@example.invalid', []), ForbiddenException);
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
});
test('unknown role bindings fail closed', () => {
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'user@example.invalid': ['board_member'] });
  assert.throws(() => new OperationsRbacService().assert('user@example.invalid', 'operations.read'), ForbiddenException);
  delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
});
