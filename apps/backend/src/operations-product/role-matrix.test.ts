import assert from 'node:assert/strict';
import test from 'node:test';
import { OperationsRbacService } from './operations-rbac.service';

test('approval permissions are unavailable to customer, driver and merchant identities', () => {
  const previous = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  try {
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ 'admin@example.org': ['smart_admin_approver'] });
    const rbac = new OperationsRbacService();
    assert.deepEqual(rbac.assert('admin@example.org', 'content.approvals.approve'), ['smart_admin_approver']);
    for (const email of ['customer@example.org', 'driver@example.org', 'merchant@example.org']) {
      assert.throws(() => rbac.assert(email, 'content.approvals.approve'));
    }
  } finally {
    if (previous === undefined) delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
    else process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = previous;
  }
});
