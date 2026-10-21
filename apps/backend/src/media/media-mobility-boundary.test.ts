import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { MediaService } from './media.service';
import type { MediaAssetType } from './media.types';

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const mobilityTypes = ['driver_photo', 'identity_card', 'driving_license', 'vehicle_license'] as const;

const mobilityUpload = (assetType: typeof mobilityTypes[number]) => ({
  ownerType: 'business_profile' as const,
  ownerId: 'business-1',
  assetType,
  visibility: 'private' as const,
  filename: `${assetType}.png`,
  mimeType: 'image/png' as const,
  sizeBytes: png.length,
  content: png.toString('base64')
});

function uploadFixture(options: {
  category: string;
  taxiSchemaReady?: boolean;
  driverStatus?: string;
  vehicleStatus?: string;
}) {
  const statements: string[] = [];
  let saves = 0;
  let deletes = 0;
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('AS owner_user_id FROM business_profiles')) {
        return { rows: [{ owner_user_id: 'owner' }], rowCount: 1 };
      }
      if (sql.startsWith('SELECT category_code FROM business_profiles')) {
        return { rows: [{ category_code: options.category }], rowCount: 1 };
      }
      if (sql.includes('SELECT id,storage_key FROM media_assets')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("to_regclass('khedmah_taxi.driver_approvals')")) {
        return { rows: [{ ready: options.taxiSchemaReady ?? true }], rowCount: 1 };
      }
      if (sql.startsWith('SELECT status FROM khedmah_taxi.driver_approvals')) {
        return options.driverStatus
          ? { rows: [{ status: options.driverStatus }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith('SELECT status FROM khedmah_taxi.vehicle_approvals')) {
        return options.vehicleStatus
          ? { rows: [{ status: options.vehicleStatus }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith('DELETE FROM khedmah_taxi.driver_approvals')) {
        return options.driverStatus
          ? { rows: [{ status: options.driverStatus }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith('DELETE FROM khedmah_taxi.vehicle_approvals')) {
        return options.vehicleStatus
          ? { rows: [{ status: options.vehicleStatus }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    }
  } as unknown as PoolClient;
  const db = {
    query: async (sql: string) => {
      if (sql.includes('AS owner_user_id')) return [{ owner_user_id: 'owner' }];
      if (sql.includes('SELECT id, storage_key FROM media_assets')) return [];
      return [];
    },
    transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
  };
  const service = new MediaService(
    db as never,
    { getCurrentUser: async () => ({ id: 'owner', email: 'owner@example.test' }) } as never,
    {} as never
  );
  Object.defineProperty(service, 'storage', { value: {
    save: async () => { saves += 1; },
    delete: async () => { deletes += 1; }
  } });
  return { service, statements, get saves() { return saves; }, get deletes() { return deletes; } };
}

test('mobility upload is rejected inside the parent transaction for unrelated business categories', async () => {
  const fixture = uploadFixture({ category: 'restaurants' });
  await assert.rejects(
    fixture.service.upload(undefined, mobilityUpload('identity_card')),
    BadRequestException
  );
  assert.equal(fixture.saves, 1);
  assert.equal(fixture.deletes, 1);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO media_assets')), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('UPDATE business_profiles')), false);
  assert.equal(fixture.statements.some((sql) => sql.includes('khedmah_taxi.driver_approvals')), false);
});

test('Taxi mobility upload atomically removes mutable operational approval and records the owner actor', async () => {
  const fixture = uploadFixture({ category: 'taxi', driverStatus: 'approved', vehicleStatus: 'approved' });
  await fixture.service.upload(undefined, mobilityUpload('driving_license'));
  const insertIndex = fixture.statements.findIndex((sql) => sql.startsWith('INSERT INTO media_assets'));
  const driverDeleteIndex = fixture.statements.findIndex((sql) => sql.startsWith('DELETE FROM khedmah_taxi.driver_approvals'));
  const vehicleDeleteIndex = fixture.statements.findIndex((sql) => sql.startsWith('DELETE FROM khedmah_taxi.vehicle_approvals'));
  assert.ok(insertIndex >= 0 && driverDeleteIndex > insertIndex && vehicleDeleteIndex > driverDeleteIndex);
  assert.equal(fixture.statements.some((sql) => sql.includes('DELETE FROM khedmah_taxi.operational_approval_events')), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO trust_history')), true);
});

test('Taxi mobility upload remains available before the operational approval schema exists', async () => {
  const fixture = uploadFixture({ category: 'taxi', taxiSchemaReady: false });
  await fixture.service.upload(undefined, mobilityUpload('vehicle_license'));
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO media_assets')), true);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('DELETE FROM khedmah_taxi.')), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO trust_history')), false);
});

test('Taxi mobility upload preserves suspended or revoked rows for an explicit security decision', async () => {
  const fixture = uploadFixture({ category: 'taxi', driverStatus: 'suspended', vehicleStatus: 'revoked' });
  await fixture.service.upload(undefined, mobilityUpload('identity_card'));
  assert.equal(fixture.statements.some((sql) => sql.startsWith('DELETE FROM khedmah_taxi.')), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO trust_history')), true);
  assert.equal(fixture.statements.some((sql) => sql.includes('operational_approval_events')), false);
});

test('courier document upload does not mutate Taxi operational approval tables', async () => {
  const fixture = uploadFixture({ category: 'delivery_courier', driverStatus: 'approved', vehicleStatus: 'approved' });
  await fixture.service.upload(undefined, mobilityUpload('driver_photo'));
  assert.equal(fixture.statements.some((sql) => sql.includes("to_regclass('khedmah_taxi.driver_approvals')")), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('DELETE FROM khedmah_taxi.')), false);
});

function deleteFixture(assetType: MediaAssetType, reviewStatus: 'pending' | 'approved' | 'rejected') {
  const statements: string[] = [];
  let storageDeletes = 0;
  const asset = {
    owner_user_id: 'owner',
    storage_key: `${assetType}.png`,
    owner_type: 'business_profile',
    owner_id: 'business-1',
    asset_type: assetType
  };
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('AS owner_user_id FROM business_profiles')) {
        return { rows: [{ owner_user_id: 'owner' }], rowCount: 1 };
      }
      if (sql.startsWith('SELECT storage_key,asset_type FROM media_assets')) {
        return { rows: [{ storage_key: asset.storage_key, asset_type: asset.asset_type, review_status: reviewStatus }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  } as unknown as PoolClient;
  const db = {
    query: async (sql: string) => sql.includes('SELECT owner_user_id, storage_key, owner_type, owner_id, asset_type') ? [asset] : [],
    transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
  };
  const service = new MediaService(
    db as never,
    { getCurrentUser: async () => ({ id: 'owner', email: 'owner@example.test' }) } as never,
    {} as never
  );
  Object.defineProperty(service, 'storage', { value: { delete: async () => { storageDeletes += 1; } } });
  return { service, statements, get storageDeletes() { return storageDeletes; } };
}

for (const [assetType, reviewStatus] of [
  ['driver_photo', 'pending'],
  ['identity_card', 'approved'],
  ['driving_license', 'rejected'],
  ['vehicle_license', 'pending']
] as const) {
  test(`generic media deletion cannot erase ${reviewStatus} ${assetType} evidence`, async () => {
    const fixture = deleteFixture(assetType, reviewStatus);
    await assert.rejects(fixture.service.delete(undefined, 'asset-1'), ForbiddenException);
    assert.equal(fixture.statements.some((sql) => sql.startsWith('DELETE FROM media_assets')), false);
    assert.equal(fixture.statements.some((sql) => sql.startsWith('UPDATE business_profiles')), false);
    assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO trust_history')), false);
    assert.equal(fixture.storageDeletes, 0);
  });
}
