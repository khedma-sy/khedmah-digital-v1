import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Module, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

type OwnerType = 'ad_listing' | 'user' | 'business_profile' | 'professional_profile' | 'product_listing';

async function withDeleteFixture(
  options: { ownerType: OwnerType; flag?: string; adStatus?: string; parentOwner?: string; missing?: boolean },
  work: (fixture: {
    endpoint: string;
    state: ReturnType<typeof makeDeleteState>;
  }) => Promise<void>
) {
  const previousFlag = process.env.CLASSIFIEDS_ENABLED;
  if (options.flag === undefined) delete process.env.CLASSIFIEDS_ENABLED;
  else process.env.CLASSIFIEDS_ENABLED = options.flag;
  const state = makeDeleteState(options);
  // Real controller/service/HTTP; database and object storage are isolated doubles.
  const query = async (sql: string) => {
    state.queries.push(sql);
    if (/^SELECT .*FROM media_assets/s.test(sql)) return state.media ? [{ ...state.media }] : [];
    if (/^SELECT .*FROM (business_profiles|professional_profiles|product_listings)/s.test(sql)) {
      return [{ owner_user_id: options.parentOwner ?? 'owner' }];
    }
    state.databaseWrites.push(sql);
    if (sql.startsWith('DELETE FROM media_assets')) {
      const removed = state.media;
      state.media = undefined;
      return removed ? [{ id: 'asset' }] : [];
    }
    if (/^UPDATE (business_profiles|professional_profiles|product_listings)/.test(sql)) return [];
    throw new Error(`Unexpected fixture query: ${sql}`);
  };
  const db = {
    query,
    transaction: async (work: (client: unknown) => Promise<unknown>) => {
      state.transactions += 1;
      return work({ query: async (sql: string) => {
        const rows = await query(sql);
        return { rows, rowCount: rows.length };
      } });
    }
  };
  const identity = { getCurrentUser: async (token?: string) => {
    if (!token) throw new UnauthorizedException();
    return { id: token, email: `${token}@example.test` };
  } };
  const service = new MediaService(db as any, identity as any);
  Object.defineProperty(service, 'storage', { value: {
    save: async () => { state.storageCalls.push('save'); },
    read: async () => { state.storageCalls.push('read'); },
    delete: async (key: string) => {
      state.storageCalls.push(`delete:${key}`);
      assert.equal(state.media, undefined, 'metadata must be removed before object cleanup');
      state.objectExists = false;
    }
  } });
  @Module({ controllers: [MediaController], providers: [{ provide: MediaService, useValue: service }] })
  class FixtureModule {}
  const app = await NestFactory.create(FixtureModule, { logger: false });
  try {
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    await work({ endpoint: `${await app.getUrl()}/api/v1/media/asset`, state });
  } finally {
    await app.close();
    if (previousFlag === undefined) delete process.env.CLASSIFIEDS_ENABLED;
    else process.env.CLASSIFIEDS_ENABLED = previousFlag;
  }
}

function makeDeleteState(options: { ownerType: OwnerType; adStatus?: string; missing?: boolean }) {
  const media = { owner_user_id: 'owner', owner_type: options.ownerType, owner_id: 'parent', storage_key: 'fixture-object' };
  return {
    media: options.missing ? undefined : media,
    ad: options.adStatus ? { status: options.adStatus, revision: 7, contentRevision: 4, receipts: [] } : undefined,
    objectExists: !options.missing,
    queries: [] as string[],
    databaseWrites: [] as string[],
    storageCalls: [] as string[],
    transactions: 0
  };
}

function assertUntouched(state: ReturnType<typeof makeDeleteState>) {
  assert.deepEqual(state.databaseWrites, []);
  assert.deepEqual(state.storageCalls, []);
  assert.equal(state.objectExists, true);
  assert.ok(state.media);
}

for (const adStatus of ['draft', 'pending_review', 'active']) {
  for (const flag of ['true', 'false', undefined]) {
    test(`shared DELETE rejects ${adStatus} Ad media when CLASSIFIEDS_ENABLED=${flag ?? 'unset'}`, async () => {
      await withDeleteFixture({ ownerType: 'ad_listing', adStatus, flag }, async ({ endpoint, state }) => {
        const before = structuredClone({ media: state.media, ad: state.ad });
        const response = await fetch(endpoint, {
          method: 'DELETE',
          headers: { cookie: 'khedmah_session=owner', 'content-type': 'application/json' },
          // Caller-supplied owner labels cannot change the server's stored media type.
          body: JSON.stringify({ ownerType: 'user', ownerId: 'owner' })
        });
        assert.equal(response.status, 403);
        await response.text();
        assertUntouched(state);
        assert.equal(state.transactions, 0);
        assert.equal(state.queries.length, 1, 'only the existing media metadata may be read');
        assert.deepEqual({ media: state.media, ad: state.ad }, before);
      });
    });
  }
}

test('shared DELETE retains anonymous, non-uploader and missing-media responses', async () => {
  await withDeleteFixture({ ownerType: 'ad_listing' }, async ({ endpoint, state }) => {
    const anonymous = await fetch(endpoint, { method: 'DELETE' });
    assert.equal(anonymous.status, 401);
    await anonymous.text();
    assert.equal(state.queries.length, 0);
    const other = await fetch(endpoint, { method: 'DELETE', headers: { cookie: 'khedmah_session=other' } });
    assert.equal(other.status, 403);
    await other.text();
    assertUntouched(state);
    assert.equal(state.transactions, 0);
  });
  await withDeleteFixture({ ownerType: 'user', missing: true }, async ({ endpoint, state }) => {
    const response = await fetch(endpoint, { method: 'DELETE', headers: { cookie: 'khedmah_session=owner' } });
    assert.equal(response.status, 404);
    await response.text();
    assert.deepEqual(state.databaseWrites, []);
    assert.deepEqual(state.storageCalls, []);
    assert.equal(state.transactions, 0);
  });
});

for (const ownerType of ['user', 'business_profile', 'professional_profile', 'product_listing'] as const) {
  test(`shared DELETE still removes owned ${ownerType} media with Classifieds disabled`, async () => {
    await withDeleteFixture({ ownerType, flag: 'false' }, async ({ endpoint, state }) => {
      const response = await fetch(endpoint, { method: 'DELETE', headers: { cookie: 'khedmah_session=owner' } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { deleted: true });
      assert.equal(state.media, undefined);
      assert.equal(state.objectExists, false);
      assert.deepEqual(state.storageCalls, ['delete:fixture-object']);
      assert.equal(state.databaseWrites.length, ownerType === 'user' ? 1 : 2);
      assert.equal(state.transactions, ownerType === 'user' ? 0 : 1);
      if (ownerType !== 'user') assert.match(state.databaseWrites[1], /moderation_status=/);
    });
  });
}

for (const ownerType of ['business_profile', 'professional_profile', 'product_listing'] as const) {
  test(`shared DELETE still denies the old uploader after ${ownerType} ownership changes`, async () => {
    await withDeleteFixture({ ownerType, parentOwner: 'new-owner' }, async ({ endpoint, state }) => {
      const response = await fetch(endpoint, { method: 'DELETE', headers: { cookie: 'khedmah_session=owner' } });
      assert.equal(response.status, 403);
      await response.text();
      assertUntouched(state);
    });
  });
}
