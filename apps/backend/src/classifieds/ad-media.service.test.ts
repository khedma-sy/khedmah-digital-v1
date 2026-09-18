import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
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
