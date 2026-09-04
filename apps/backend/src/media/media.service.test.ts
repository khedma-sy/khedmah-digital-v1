import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const request = {
  ownerType: 'product_listing',
  ownerId: 'product-1',
  visibility: 'public',
  filename: 'product.png',
  mimeType: 'image/png',
  sizeBytes: png.length,
  content: png.toString('base64'),
  assetType: 'product_image',
  sortOrder: 4
};

function createService(existingCount: number, failInsert = false) {
  const transactionQueries: Array<{ sql: string; params?: unknown[] }> = [];
  const storageOperations: string[] = [];
  const database = {
    query: async (sql: string) => sql.includes('FROM product_listings') ? [{ owner_user_id: 'owner-1' }] : [],
    transaction: async (operation: (client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ count?: string }> }> }) => Promise<void>) => operation({
      query: async (sql: string, params?: unknown[]) => {
        transactionQueries.push({ sql, params });
        if (failInsert && sql.includes('INSERT INTO media_assets')) throw new Error('insert_failed');
        return sql.includes('COUNT(*)') ? { rows: [{ count: String(existingCount) }] } : { rows: [] };
      }
    })
  };
  const identity = { getCurrentUser: async () => ({ id: 'owner-1' }) };
  const service = new MediaService(database as never, identity as never, {permissionsFor:()=>[]} as never);
  (service as unknown as { storage: { save: () => Promise<void>; delete: () => Promise<void>; read: () => Promise<never> } }).storage = {
    save: async () => { storageOperations.push('save'); },
    delete: async () => { storageOperations.push('delete'); },
    read: async () => { throw new Error('not_used'); }
  };
  return { service, transactionQueries, storageOperations };
}

test('the fifth product image is counted and inserted under one owner-scoped transaction lock', async () => {
  const { service, transactionQueries } = createService(4);
  const asset = await service.upload(undefined, request);
  assert.equal(asset.ownerId, 'product-1');
  assert.equal(asset.assetType, 'product_image');
  assert.equal(transactionQueries.length, 3);
  assert.match(transactionQueries[0]!.sql, /pg_advisory_xact_lock/);
  assert.deepEqual(transactionQueries[0]!.params, ['product_listing:product-1:product_image']);
  assert.match(transactionQueries[1]!.sql, /COUNT\(\*\).*media_assets/);
  assert.match(transactionQueries[2]!.sql, /INSERT INTO media_assets/);
});

test('the product image limit fails before storage or insertion when five images already exist', async () => {
  const { service, transactionQueries } = createService(5);
  await assert.rejects(() => service.upload(undefined, request), (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    assert.match(error.message, /5 صورة كحد أقصى/);
    return true;
  });
  assert.equal(transactionQueries.length, 2);
  assert.doesNotMatch(transactionQueries.map((query) => query.sql).join('\n'), /INSERT INTO media_assets/);
});

test('a stored product image is removed when its database insertion fails', async () => {
  const { service, storageOperations } = createService(4, true);
  await assert.rejects(() => service.upload(undefined, request), /insert_failed/);
  assert.deepEqual(storageOperations, ['save', 'delete']);
});
