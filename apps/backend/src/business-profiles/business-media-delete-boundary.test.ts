import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabasePool } from '../database/database.pool';
import { BusinessProfileRepository } from './business-profile.repository';

const protectedAssets = [
  { asset_type: 'business_verification_evidence', visibility: 'private' },
  { asset_type: 'identity_card', visibility: 'private' },
  { asset_type: 'driver_photo', visibility: 'private' },
  { asset_type: 'service_image', visibility: 'public' },
  { asset_type: 'logo', visibility: 'private' }
] as const;

for (const protectedAsset of protectedAssets) {
  test(`legacy business deletion cannot remove protected ${protectedAsset.visibility} ${protectedAsset.asset_type}`, async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('SELECT owner_user_id FROM business_profiles')) {
          return { rows: [{ owner_user_id: 'owner-1' }], rowCount: 1 };
        }
        if (sql.includes('SELECT asset_type,visibility FROM media_assets')) {
          return { rows: [protectedAsset], rowCount: 1 };
        }
        throw new Error(`Protected media attempted a state-changing statement: ${sql}`);
      }
    } as unknown as PoolClient;
    const db = {
      transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
    } as unknown as DatabasePool;

    await assert.rejects(
      new BusinessProfileRepository(db).deleteMediaAsset('business-1', 'asset-1', 'owner-1'),
      BadRequestException
    );
    assert.equal(statements.some((sql) => /DELETE\s+FROM\s+media_assets/i.test(sql)), false);
    assert.equal(statements.some((sql) => /UPDATE\s+business_profiles/i.test(sql)), false);
  });
}

test('legacy business deletion remains available for public display media and invalidates moderation only after deletion', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('SELECT owner_user_id FROM business_profiles')) {
        return { rows: [{ owner_user_id: 'owner-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT asset_type,visibility FROM media_assets')) {
        return { rows: [{ asset_type: 'cover', visibility: 'public' }], rowCount: 1 };
      }
      if (/DELETE\s+FROM\s+media_assets/i.test(sql)) return { rows: [{ id: 'asset-1' }], rowCount: 1 };
      if (/UPDATE\s+business_profiles/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected statement: ${sql}`);
    }
  } as unknown as PoolClient;
  const db = {
    transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
  } as unknown as DatabasePool;

  await new BusinessProfileRepository(db).deleteMediaAsset('business-1', 'asset-1', 'owner-1');
  const deletion = statements.findIndex((sql) => /DELETE\s+FROM\s+media_assets/i.test(sql));
  const invalidation = statements.findIndex((sql) => /UPDATE\s+business_profiles/i.test(sql));
  assert.ok(deletion >= 0);
  assert.ok(invalidation > deletion);
});
