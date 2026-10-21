import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DriverDocumentReviewService } from './driver-document-review.service';

const actor = {
  id: 'mobility-reviewer',
  email: 'mobility-reviewer@example.test',
  status: 'active',
  profile: { displayName: 'Reviewer', locale: 'ar' }
} as const;

test('mobility approval authority can read the human review queue', async () => {
  const calls: string[][] = [];
  const service = new DriverDocumentReviewService(
    { query: async () => [] } as never,
    { getCurrentUser: async () => actor } as never,
    {
      assert: () => { throw new ForbiddenException('security.manage unavailable'); },
      assertAny: (_email: string, permissions: readonly string[]) => { calls.push([...permissions]); return []; }
    } as never
  );

  assert.deepEqual(await service.reviewQueue('khedmah_session=reviewer'), { businesses: [] });
  assert.deepEqual(calls, [['security.manage', 'mobility.approvals.approve']]);
});

test('a reviewer cannot approve their own mobility document', async () => {
  let writes = 0;
  const client = {
    async query(sql: string) {
      if (sql.includes('SELECT owner_id FROM media_assets')) return { rows: [{ owner_id: 'business-1' }], rowCount: 1 };
      if (sql.includes('SELECT id,owner_user_id FROM business_profiles')) {
        return { rows: [{ id: 'business-1', owner_user_id: actor.id }], rowCount: 1 };
      }
      writes += 1;
      return { rows: [], rowCount: 1 };
    }
  };
  const service = new DriverDocumentReviewService(
    { transaction: async (work: (value: typeof client) => Promise<unknown>) => work(client) } as never,
    { getCurrentUser: async () => actor } as never,
    { assert: () => [], assertAny: () => [] } as never
  );

  await assert.rejects(
    service.review('khedmah_session=reviewer', 'document-1', 'approved', undefined),
    ForbiddenException
  );
  assert.equal(writes, 0);
});

test('bounded mobility approval authority cannot reject a document', async () => {
  let transactions = 0;
  const service = new DriverDocumentReviewService(
    { transaction: async () => { transactions += 1; throw new Error('unexpected transaction'); } } as never,
    { getCurrentUser: async () => actor } as never,
    {
      assertAny: () => [],
      assert: () => { throw new ForbiddenException('security.manage required'); }
    } as never
  );

  await assert.rejects(
    service.review('khedmah_session=reviewer', 'document-1', 'rejected', 'The document is not readable.'),
    ForbiddenException
  );
  assert.equal(transactions, 0);
});

test('bounded mobility approval authority cannot read a non-mobility business document', async () => {
  let permissionChecks = 0;
  const service = new DriverDocumentReviewService(
    {
      query: async (sql: string) => {
        assert.match(sql, /category_code IN \('taxi','delivery_courier'\)/);
        return [];
      }
    } as never,
    { getCurrentUser: async () => actor } as never,
    { assertAny: () => { permissionChecks += 1; return []; } } as never
  );

  await assert.rejects(
    service.read('khedmah_session=reviewer', 'non-mobility-document'),
    NotFoundException
  );
  assert.equal(permissionChecks, 0);
});

test('a non-mobility business document cannot be approved through the mobility review route', async () => {
  let writes = 0;
  const client = {
    async query(sql: string) {
      if (sql.includes('SELECT owner_id FROM media_assets')) return { rows: [{ owner_id: 'business-1' }], rowCount: 1 };
      if (sql.includes('SELECT id,owner_user_id FROM business_profiles')) {
        assert.match(sql, /category_code IN \('taxi','delivery_courier'\)/);
        return { rows: [], rowCount: 0 };
      }
      writes += 1;
      return { rows: [], rowCount: 0 };
    }
  };
  const service = new DriverDocumentReviewService(
    { transaction: async (work: (value: typeof client) => Promise<unknown>) => work(client) } as never,
    { getCurrentUser: async () => actor } as never,
    { assert: () => [], assertAny: () => [] } as never
  );

  await assert.rejects(
    service.review('khedmah_session=reviewer', 'document-1', 'approved', undefined),
    NotFoundException
  );
  assert.equal(writes, 0);
});

test('document bytes are not returned when mobility scope disappears during storage read', async () => {
  let metadataReads = 0;
  let storageReads = 0;
  const service = new DriverDocumentReviewService(
    {
      query: async (sql: string) => {
        if (sql.includes('SELECT id FROM media_assets')) return [{ id: 'document-1' }];
        metadataReads += 1;
        if (metadataReads === 1) {
          return [{
            storage_key: 'private/document-1', mime_type: 'image/png', owner_id: 'business-1', owner_user_id: 'owner-1',
            asset_type: 'driving_license'
          }];
        }
        // Represents the business leaving the Taxi/courier scope, the asset no
        // longer being private, or the document being removed while storage is read.
        return [];
      }
    } as never,
    { getCurrentUser: async () => actor } as never,
    { assertAny: () => [], assert: () => { throw new ForbiddenException('bounded reviewer'); } } as never
  );
  Object.defineProperty(service, 'storage', { value: {
    read: async () => { storageReads += 1; return { data: Buffer.from('private-bytes'), mimeType: 'image/png' }; }
  } });

  await assert.rejects(
    service.read('khedmah_session=reviewer', 'document-1'),
    NotFoundException
  );
  assert.equal(metadataReads, 2);
  assert.equal(storageReads, 1);
});

test('document bytes are not returned when reviewer authority is revoked during storage read', async () => {
  let permissionChecks = 0;
  const row = {
    storage_key: 'private/document-1', mime_type: 'image/png', owner_id: 'business-1', owner_user_id: 'owner-1',
    asset_type: 'driving_license'
  };
  const service = new DriverDocumentReviewService(
    { query: async (sql: string) => sql.includes('SELECT id FROM media_assets') ? [{ id: 'document-1' }] : [row] } as never,
    { getCurrentUser: async () => actor } as never,
    {
      assertAny: () => {
        permissionChecks += 1;
        if (permissionChecks === 2) throw new ForbiddenException('review authority revoked');
        return [];
      },
      assert: () => { throw new ForbiddenException('bounded reviewer'); }
    } as never
  );
  Object.defineProperty(service, 'storage', { value: {
    read: async () => ({ data: Buffer.from('private-bytes'), mimeType: 'image/png' })
  } });

  await assert.rejects(
    service.read('khedmah_session=reviewer', 'document-1'),
    ForbiddenException
  );
  assert.equal(permissionChecks, 2);
});

test('document bytes are not returned when the authenticated actor changes during storage read', async () => {
  let identityReads = 0;
  const row = {
    storage_key: 'private/document-1', mime_type: 'image/png', owner_id: 'business-1', owner_user_id: 'owner-1',
    asset_type: 'driving_license'
  };
  const service = new DriverDocumentReviewService(
    { query: async (sql: string) => sql.includes('SELECT id FROM media_assets') ? [{ id: 'document-1' }] : [row] } as never,
    {
      getCurrentUser: async () => {
        identityReads += 1;
        return identityReads === 1 ? actor : { ...actor, id: 'different-actor' };
      }
    } as never,
    { assertAny: () => [], assert: () => { throw new ForbiddenException('bounded reviewer'); } } as never
  );
  Object.defineProperty(service, 'storage', { value: {
    read: async () => ({ data: Buffer.from('private-bytes'), mimeType: 'image/png' })
  } });

  await assert.rejects(
    service.read('khedmah_session=reviewer', 'document-1'),
    ForbiddenException
  );
  assert.equal(identityReads, 2);
});

function reviewTransitionHarness(options: {
  currentStatus?: 'pending' | 'approved' | 'rejected';
  latestId?: string;
  securityOverride?: boolean;
} = {}) {
  const writes: string[] = [];
  let securityChecks = 0;
  const client = {
    async query(sql: string) {
      if (sql.includes('SELECT owner_id FROM media_assets')) {
        return { rows: [{ owner_id: 'business-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT id,owner_user_id FROM business_profiles')) {
        return { rows: [{ id: 'business-1', owner_user_id: 'owner-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT owner_id,asset_type FROM media_assets')) {
        return { rows: [{ owner_id: 'business-1', asset_type: 'driving_license' }], rowCount: 1 };
      }
      if (sql.includes('SELECT id FROM media_assets')) {
        return { rows: [{ id: options.latestId ?? 'document-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT status FROM mobility_document_reviews')) {
        return { rows: options.currentStatus ? [{ status: options.currentStatus }] : [], rowCount: options.currentStatus ? 1 : 0 };
      }
      if (sql.includes('INSERT INTO mobility_document_reviews') || sql.includes('INSERT INTO mobility_document_review_events')) {
        writes.push(sql);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const service = new DriverDocumentReviewService(
    { transaction: async (work: (value: typeof client) => Promise<unknown>) => work(client) } as never,
    { getCurrentUser: async () => actor } as never,
    {
      assertAny: () => [],
      assert: () => {
        securityChecks += 1;
        if (!options.securityOverride) throw new ForbiddenException('security.manage required');
        return [];
      }
    } as never
  );
  return { service, writes, securityChecks: () => securityChecks };
}

test('bounded mobility authority can approve a latest document whose current state is pending', async () => {
  const fixture = reviewTransitionHarness({ currentStatus: 'pending' });
  const result = await fixture.service.review('khedmah_session=reviewer', 'document-1', 'approved', undefined);
  assert.equal(result.status, 'approved');
  assert.equal(fixture.writes.length, 2);
  assert.equal(fixture.securityChecks(), 0);
});

test('bounded mobility authority cannot reverse a rejected document decision', async () => {
  const fixture = reviewTransitionHarness({ currentStatus: 'rejected' });
  await assert.rejects(
    fixture.service.review('khedmah_session=reviewer', 'document-1', 'approved', undefined),
    ForbiddenException
  );
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.securityChecks(), 1);
});

test('security authority can explicitly re-approve a rejected latest document', async () => {
  const fixture = reviewTransitionHarness({ currentStatus: 'rejected', securityOverride: true });
  const result = await fixture.service.review('khedmah_session=reviewer', 'document-1', 'approved', undefined);
  assert.equal(result.status, 'approved');
  assert.equal(fixture.writes.length, 2);
  assert.equal(fixture.securityChecks(), 1);
});

test('a superseded mobility document cannot be approved by id', async () => {
  const fixture = reviewTransitionHarness({ currentStatus: 'pending', latestId: 'document-2' });
  await assert.rejects(
    fixture.service.review('khedmah_session=reviewer', 'document-1', 'approved', undefined),
    ConflictException
  );
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.securityChecks(), 0);
});

test('bounded mobility reviewer cannot read a superseded document by id', async () => {
  let storageReads = 0;
  const document = {
    storage_key: 'private/document-1', mime_type: 'image/png', owner_id: 'business-1', owner_user_id: 'owner-1',
    asset_type: 'driving_license'
  };
  const service = new DriverDocumentReviewService(
    {
      query: async (sql: string) => sql.includes('SELECT id FROM media_assets') ? [{ id: 'document-2' }] : [document]
    } as never,
    { getCurrentUser: async () => actor } as never,
    {
      assertAny: () => [],
      assert: () => { throw new ForbiddenException('bounded reviewer'); }
    } as never
  );
  Object.defineProperty(service, 'storage', { value: {
    read: async () => { storageReads += 1; return { data: Buffer.from('private-bytes'), mimeType: 'image/png' }; }
  } });

  await assert.rejects(service.read('khedmah_session=reviewer', 'document-1'), NotFoundException);
  assert.equal(storageReads, 0);
});

test('bounded mobility reviewer receives no bytes when a document becomes superseded during storage read', async () => {
  let latestReads = 0;
  let storageReads = 0;
  const document = {
    storage_key: 'private/document-1', mime_type: 'image/png', owner_id: 'business-1', owner_user_id: 'owner-1',
    asset_type: 'driving_license'
  };
  const service = new DriverDocumentReviewService(
    {
      query: async (sql: string) => {
        if (sql.includes('SELECT id FROM media_assets')) {
          latestReads += 1;
          return [{ id: latestReads === 1 ? 'document-1' : 'document-2' }];
        }
        return [document];
      }
    } as never,
    { getCurrentUser: async () => actor } as never,
    {
      assertAny: () => [],
      assert: () => { throw new ForbiddenException('bounded reviewer'); }
    } as never
  );
  Object.defineProperty(service, 'storage', { value: {
    read: async () => { storageReads += 1; return { data: Buffer.from('private-bytes'), mimeType: 'image/png' }; }
  } });

  await assert.rejects(service.read('khedmah_session=reviewer', 'document-1'), NotFoundException);
  assert.equal(storageReads, 1);
  assert.equal(latestReads, 2);
});

test('bounded mobility document list is restricted to the latest asset of each type', async () => {
  let listSql = '';
  const service = new DriverDocumentReviewService(
    {
      query: async (sql: string) => {
        if (sql.includes('SELECT owner_user_id FROM business_profiles')) return [{ owner_user_id: 'owner-1' }];
        listSql = sql;
        return [];
      }
    } as never,
    { getCurrentUser: async () => actor } as never,
    {
      assertAny: () => [],
      assert: () => { throw new ForbiddenException('bounded reviewer'); }
    } as never
  );

  assert.deepEqual(await service.list('khedmah_session=reviewer', 'business-1'), []);
  assert.match(listSql, /SELECT newest\.id FROM media_assets newest/);
  assert.match(listSql, /newest\.asset_type=m\.asset_type/);
});

test('security authority retains governed access to historical mobility documents', async () => {
  let latestReads = 0;
  const document = {
    storage_key: 'private/document-1', mime_type: 'image/png', owner_id: 'business-1', owner_user_id: 'owner-1',
    asset_type: 'driving_license'
  };
  const service = new DriverDocumentReviewService(
    {
      query: async (sql: string) => {
        if (sql.includes('SELECT id FROM media_assets')) latestReads += 1;
        return [document];
      }
    } as never,
    { getCurrentUser: async () => actor } as never,
    { assertAny: () => [], assert: () => [] } as never
  );
  Object.defineProperty(service, 'storage', { value: {
    read: async () => ({ data: Buffer.from('historical-bytes'), mimeType: 'image/png' })
  } });

  const result = await service.read('khedmah_session=reviewer', 'document-1');
  assert.equal(result.data.toString(), 'historical-bytes');
  assert.equal(latestReads, 0);
});
