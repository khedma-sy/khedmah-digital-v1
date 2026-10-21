import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { IdentityRepository } from '../identity/identity.repository';
import type { IdentityService } from '../identity/identity.service';
import { OperationsProductRepository } from './operations-product.repository';
import { OperationsProductService } from './operations-product.service';
import { OperationsRbacService } from './operations-rbac.service';

function serviceFor(email: string) {
  const reads = { incidents: 0, changes: 0, audit: 0 };
  const identity = {
    getCurrentUser: async () => ({ id: 'reviewer-user', email })
  } as unknown as IdentityService;
  const identityRepository = {
    appendAuditLog: async () => undefined
  } as unknown as IdentityRepository;
  const repository = {
    listIncidents: () => { reads.incidents += 1; return []; },
    listChanges: () => { reads.changes += 1; return []; },
    listAudit: () => { reads.audit += 1; return []; }
  } as unknown as OperationsProductRepository;
  return { service: new OperationsProductService(
    identity,
    identityRepository,
    new OperationsRbacService(),
    repository
  ), reads };
}

test('approval-only role can open overview but cannot read operations inventory, history, or KORA audit path', async () => {
  const previous = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({
    'approver@example.invalid': ['smart_admin_approver']
  });
  try {
    const { service, reads } = serviceFor('approver@example.invalid');
    const overview = await service.overview(undefined);
    assert.deepEqual(overview.roles, ['smart_admin_approver']);
    assert.deepEqual(overview.permissions, [
      'content.approvals.approve',
      'trust.approvals.approve',
      'mobility.approvals.approve'
    ]);
    assert.deepEqual(overview.services, []);
    assert.equal(overview.health.status, 'restricted');
    assert.equal(overview.openIncidents, 0);
    assert.equal(overview.pendingChanges, 0);
    assert.deepEqual(reads, { incidents: 0, changes: 0, audit: 0 });
    await assert.rejects(service.inventory(undefined), ForbiddenException);
    await assert.rejects(service.histories(undefined), ForbiddenException);
    await assert.rejects(
      service.recordSupervisedAdminAudit(undefined, 'kora.metrics.read', 'fixture'),
      ForbiddenException
    );
    assert.deepEqual(reads, { incidents: 0, changes: 0, audit: 0 });
  } finally {
    if (previous === undefined) delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
    else process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = previous;
  }
});

test('operations.read retains overview, inventory, and history access', async () => {
  const previous = process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({
    'sre@example.invalid': ['site_reliability_engineer']
  });
  try {
    const { service } = serviceFor('sre@example.invalid');
    assert.deepEqual((await service.overview(undefined)).roles, ['site_reliability_engineer']);
    assert.ok((await service.inventory(undefined)).length > 0);
    assert.deepEqual(await service.histories(undefined), {
      builds: [], deployments: [], releases: [], changes: [], incidents: [], audit: []
    });
  } finally {
    if (previous === undefined) delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
    else process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = previous;
  }
});
