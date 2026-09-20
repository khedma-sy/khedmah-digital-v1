import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import { TaxiOperationalApprovalService } from './taxi-operational-approval.service';

// Real canonical tables, INSERT conflict handling and transaction rollback on an
// explicitly disposable PostgreSQL database. Identity/RBAC are test fixtures;
// this is not an authenticated browser or a live driver-enrollment acceptance.
test('concurrent first Taxi approvals preserve one driver binding and roll back the losing vehicle', { timeout: 30_000 }, async () => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const identity = new IdentityRepository(db);
  const driverId = randomUUID(), adminId = randomUUID();
  const businesses = [randomUUID(), randomUUID()];
  let createdTaxiSchema = false;
  let barrierEnabled = true, prechecks = 0;
  let releaseReads!: () => void;
  const bothReads = new Promise<void>(done => { releaseReads = done; });
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const racingDb = {
    query: db.query.bind(db),
    transaction: <T>(work: (client: PoolClient) => Promise<T>) => db.transaction(client => {
      const instrumented = new Proxy(client, {
        get(target, property, receiver) {
          if (property !== 'query') return Reflect.get(target, property, receiver);
          return async (sql: string, values?: unknown[]) => {
            const result = await target.query(sql, values);
            if (barrierEnabled && sql.includes('FROM khedmah_taxi.driver_approvals') && sql.includes('FOR UPDATE')) {
              assert.equal(result.rows.length, 0, 'Both first approvals must observe an absent driver row.');
              prechecks += 1;
              if (prechecks === 2) releaseReads();
              await bothReads;
              assert.equal(prechecks, 2, 'The competing prechecks did not reach the barrier.');
            }
            return result;
          };
        }
      });
      return work(instrumented);
    })
  };
  const service = new TaxiOperationalApprovalService(racingDb as never,
    { async getCurrentUser() { return { id: adminId, email: 'reviewer@example.test' }; } } as never,
    { assert() {} } as never);
  const input = {
    zoneCode: 'damascus-test', verificationReference: 'disposable-concurrency-fixture',
    reason: 'Synthetic documents reviewed for an isolated concurrency regression.',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
  try {
    await resetCanonicalTestSchema(pool);
    // Apply the governed Store/Classifieds/Document contracts required by this
    // approval path; unrelated order, billing and notification tables are unused.
    for (const migration of ['024_product_store', '025_classifieds', '027_mobility_document_reviews',
      '031_taxi_operational_approvals', '032_taxi_operational_profile_gate']) {
      await pool.query(await readFile(resolve(__dirname, '../../../../backend/migrations/versions', `${migration}.sql`), 'utf8'));
      if (migration === '031_taxi_operational_approvals') createdTaxiSchema = true;
    }
    const now = new Date().toISOString();
    for (const id of [driverId, adminId]) {
      await identity.saveAccount({ id, email: `${id}@example.test`, passwordHash: 'nonlogin-test-hash', status: 'active', createdAt: now, updatedAt: now });
    }
    for (const businessId of businesses) {
      await pool.query(`INSERT INTO business_profiles
        (id,name,owner_user_id,category_code,city_code,visibility,moderation_status,trust_status,status)
        VALUES($1,'Disposable Taxi',$2,'taxi','damascus','public','approved','approved','active')`, [businessId, driverId]);
      for (const kind of ['driver_photo', 'identity_card', 'driving_license', 'vehicle_license']) {
        const mediaId = randomUUID();
        await pool.query(`INSERT INTO media_assets
          (id,owner_user_id,owner_type,owner_id,filename,mime_type,size_bytes,visibility,storage_key,asset_type)
          VALUES($1,$2,'business_profile',$3,'fixture.png','image/png',1,'private',$1,$4)`, [mediaId, driverId, businessId, kind]);
        await pool.query(`UPDATE mobility_document_reviews SET status='approved',reviewed_by=$2,reviewed_at=NOW()
          WHERE media_asset_id=$1`, [mediaId, adminId]);
      }
    }

    watchdog = setTimeout(releaseReads, 5000);
    const outcomes = await Promise.allSettled(businesses.map(id => service.approve('test-fixture', id, input)));
    clearTimeout(watchdog);
    barrierEnabled = false;
    assert.equal(prechecks, 2);
    const successes = outcomes.filter(result => result.status === 'fulfilled');
    const failures = outcomes.filter(result => result.status === 'rejected');
    assert.equal(successes.length, 1, 'Two concurrent first approvals must not both succeed.');
    assert.equal(failures.length, 1);
    assert.ok(failures[0].reason instanceof ConflictException);
    const winningProfile = successes[0].value.businessProfileId;
    const losingProfile = businesses.find(id => id !== winningProfile)!;
    const savedDriver = (await pool.query('SELECT business_profile_id,vehicle_id,revision FROM khedmah_taxi.driver_approvals')).rows;
    const savedVehicles = (await pool.query('SELECT business_profile_id,id,revision FROM khedmah_taxi.vehicle_approvals')).rows;
    const savedEvents = (await pool.query('SELECT business_profile_id,driver_revision,vehicle_revision FROM khedmah_taxi.operational_approval_events')).rows;
    assert.deepEqual(savedDriver, [{ business_profile_id: winningProfile, vehicle_id: `taxi_vehicle_${winningProfile}`, revision: '1' }]);
    assert.deepEqual(savedVehicles, [{ business_profile_id: winningProfile, id: `taxi_vehicle_${winningProfile}`, revision: '1' }]);
    assert.deepEqual(savedEvents, [{ business_profile_id: winningProfile, driver_revision: '1', vehicle_revision: '1' }]);
    await assert.rejects(service.approve('test-fixture', losingProfile, input), ConflictException);

    // The conditional conflict update still permits a legitimate renewal of
    // the winning profile and preserves both audit revisions.
    const renewed = await service.approve('test-fixture', winningProfile, input);
    assert.equal(renewed.driverRevision, '2');
    assert.equal(renewed.vehicleRevision, '2');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM khedmah_taxi.operational_approval_events')).rows[0].n, 2);
  } finally {
    if (watchdog) clearTimeout(watchdog);
    releaseReads();
    try { if (createdTaxiSchema) await pool.query('DROP SCHEMA khedmah_taxi CASCADE'); }
    finally { await pool.end(); }
  }
});
