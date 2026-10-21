import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AdMediaService } from './ad-media.service';

function makeService(dbOverride?: unknown) {
  const db = dbOverride ?? {
    transaction: async () => { throw new Error('database must not be reached'); },
    query: async () => { throw new Error('database must not be reached'); }
  };
  const identity = { getCurrentUser: async () => ({ id: 'owner', email: 'owner@example.test' }) } as any;
  const rbac = { assert() {} } as any;
  return new AdMediaService(db as any, identity, rbac);
}

async function withFlag<T>(value: string | undefined, work: () => Promise<T>): Promise<T> {
  const previous = process.env.CLASSIFIEDS_ENABLED;
  if (value === undefined) delete process.env.CLASSIFIEDS_ENABLED;
  else process.env.CLASSIFIEDS_ENABLED = value;
  try { return await work(); }
  finally {
    if (previous === undefined) delete process.env.CLASSIFIEDS_ENABLED;
    else process.env.CLASSIFIEDS_ENABLED = previous;
  }
}

test('classifieds media is fail-closed before identity, database or storage work', async () => {
  const service = makeService();
  await assert.rejects(() => withFlag(undefined, () => service.listMine(undefined, 'ad-1')), ServiceUnavailableException);
  await assert.rejects(() => withFlag('TRUE', () => service.listMine(undefined, 'ad-1')), ServiceUnavailableException);
});

test('classifieds media verifies file signature before database or storage work', async () => {
  const service = makeService();
  const fakePng = Buffer.from('not-a-png');
  await assert.rejects(() => withFlag('true', () => service.upload(undefined, 'ad-1', {
    clientRequestId: 'classifieds-media-signature-0001',
    expectedContentRevision: 1,
    filename: 'fake.png',
    mimeType: 'image/png',
    sizeBytes: fakePng.length,
    content: fakePng.toString('base64')
  })), BadRequestException);
});

test('classifieds media maps missing migration 025 to service unavailable', async () => {
  const service = makeService({
    query: async () => { throw { code: '42P01', message: 'relation does not exist' }; },
    transaction: async () => { throw { code: '42P01', message: 'relation does not exist' }; }
  });
  await assert.rejects(() => withFlag('true', () => service.listMine(undefined, 'ad-1')), ServiceUnavailableException);
});

test('bounded content approver can inspect the exact image under review', async () => {
  const permissions: string[][] = [];
  const db = {
    query: async (sql: string) => {
      assert.match(sql, /FROM media_assets m JOIN ad_listings a/);
      assert.match(sql, /a\.status='pending_review'/);
      return [{
        id: 'image-1', owner_user_id: 'owner', owner_id: 'ad-1', filename: 'review.png',
        mime_type: 'image/png', size_bytes: 8, visibility: 'public', storage_key: 'review/object',
        public_url: '/api/v1/classifieds/media/public/image-1', sort_order: 0, created_at: new Date(0)
      }];
    }
  };
  const identity = { getCurrentUser: async () => ({ id: 'reviewer', email: 'reviewer@example.test' }) } as any;
  const rbac = {
    assertAny: (_email: string, requested: string[]) => { permissions.push(requested); },
    assert: () => { throw new ForbiddenException('bounded reviewer'); }
  } as any;
  const service = new AdMediaService(db as any, identity, rbac);
  Object.defineProperty(service, 'storage', { value: {
    read: async () => ({ data: Buffer.from('review'), mimeType: 'image/png' })
  } });

  const result = await withFlag('true', () => service.readForReview('khedmah_session=reviewer', 'image-1'));
  assert.equal(result.data.toString(), 'review');
  assert.deepEqual(permissions, [
    ['security.manage', 'content.approvals.approve'],
    ['security.manage', 'content.approvals.approve']
  ]);
});

test('bounded content approver cannot read active or rejected classified media outside the pending queue', async () => {
  let storageReads = 0;
  const db = {
    query: async (sql: string) => {
      assert.match(sql, /a\.status='pending_review'/);
      return [];
    }
  };
  const service = new AdMediaService(
    db as any,
    { getCurrentUser: async () => ({ id: 'reviewer', email: 'reviewer@example.test' }) } as any,
    {
      assertAny: () => undefined,
      assert: () => { throw new ForbiddenException('bounded reviewer'); }
    } as any
  );
  Object.defineProperty(service, 'storage', { value: {
    read: async () => { storageReads += 1; return { data: Buffer.from('hidden'), mimeType: 'image/png' }; }
  } });

  await assert.rejects(
    withFlag('true', () => service.readForReview('khedmah_session=reviewer', 'image-1')),
    NotFoundException
  );
  assert.equal(storageReads, 0);
});

test('security authority retains governed access to non-pending classified media', async () => {
  const db = {
    query: async (sql: string) => {
      assert.match(sql, /a\.status IN \('pending_review','active','rejected'\)/);
      return [{
        id: 'image-1', owner_user_id: 'owner', owner_id: 'ad-1', filename: 'review.png',
        mime_type: 'image/png', size_bytes: 8, visibility: 'public', storage_key: 'review/object',
        public_url: '/api/v1/classifieds/media/public/image-1', sort_order: 0, created_at: new Date(0)
      }];
    }
  };
  const service = new AdMediaService(
    db as any,
    { getCurrentUser: async () => ({ id: 'security', email: 'security@example.test' }) } as any,
    { assertAny: () => undefined, assert: () => undefined } as any
  );
  Object.defineProperty(service, 'storage', { value: {
    read: async () => ({ data: Buffer.from('review'), mimeType: 'image/png' })
  } });

  const result = await withFlag('true', () => service.readForReview('khedmah_session=security', 'image-1'));
  assert.equal(result.data.toString(), 'review');
});

test('classifieds media rejects a sixth image while the ad row lock serializes the limit', async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes('FROM ad_listings WHERE id=$1 FOR UPDATE')) {
        return { rows: [{
          id: 'ad-1', owner_user_id: 'owner', business_profile_id: null, status: 'draft', revision: 1, content_revision: 1
        }], rowCount: 1 };
      }
      if (sql.includes("action='media'")) return { rows: [], rowCount: 0 };
      if (sql.includes('count(*)::int AS count FROM media_assets')) return { rows: [{ count: 5 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
  };
  const service = makeService({
    query: async () => { throw new Error('direct database query was not expected'); },
    transaction: async (work: (value: typeof client) => Promise<unknown>) => work(client)
  });
  const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);

  await assert.rejects(
    () => withFlag('true', () => service.upload(undefined, 'ad-1', {
      clientRequestId: 'classifieds-sixth-image-0001',
      expectedContentRevision: 1,
      filename: 'sixth.png',
      mimeType: 'image/png',
      sizeBytes: png.length,
      content: png.toString('base64'),
      sortOrder: 5
    })),
    (cause: unknown) => cause instanceof BadRequestException
      && (cause.getResponse() as { code?: string }).code === 'AD_IMAGE_LIMIT_REACHED'
  );
  assert.ok(queries.some((sql) => sql.includes('FOR UPDATE')), 'the ad must be locked before counting its images');
});
