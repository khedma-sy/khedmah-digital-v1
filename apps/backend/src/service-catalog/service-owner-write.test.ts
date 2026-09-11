import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { ProfessionalProfileRepository } from '../professional-profiles/professional-profile.repository';
import { CategoryRepository } from '../categories/category.repository';
import { CategoryService } from '../categories/category.service';
import { ServiceCatalogRepository } from './service-catalog.repository';
import { ServiceCatalogService } from './service-catalog.service';
import type { ServiceListing, ServiceOwnerType } from './service-catalog.types';

// Real PostgreSQL transactions on the explicitly disposable canonical schema.
test('service mutations authorize the current parent and never upsert stale edits', { timeout: 90_000 }, async (t) => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const repository = new ServiceCatalogRepository(db);
  const businessProfiles = new BusinessProfileRepository(db);
  const professionalProfiles = new ProfessionalProfileRepository(db);
  const categories = new CategoryService(new CategoryRepository(db));
  const owner = 'rp25_owner';
  const nextOwner = 'rp25_next_owner';
  const otherOwner = 'rp25_other_owner';
  const serviceId = 'rp25_existing_service';
  const newId = 'rp25_new_service';
  const parentId = (type: ServiceOwnerType) => type === 'business' ? 'rp25_business' : 'professional_profile_rp25_owner';
  const otherParentId = (type: ServiceOwnerType) => type === 'business' ? 'rp25_other_business' : 'professional_profile_rp25_other';
  const parentSql = (type: ServiceOwnerType) => type === 'business'
    ? `SELECT id FROM business_profiles WHERE id=$1 FOR UPDATE`
    : `SELECT professional_profile_identifier FROM professional_profiles WHERE professional_profile_identifier=$1 FOR UPDATE`;
  const serviceFor = (repo: ServiceCatalogRepository, actorId = owner) => new ServiceCatalogService(
    repo, { getCurrentUser: async () => ({ id: actorId }) } as any, businessProfiles, professionalProfiles, categories
  );
  async function snapshot(client?: PoolClient) {
    const sql = `SELECT * FROM service_listings WHERE id LIKE 'rp25_%' ORDER BY id`;
    return client ? (await client.query(sql)).rows : db.query(sql);
  }
  async function changeParent(type: ServiceOwnerType, change: 'transfer' | 'delete', client?: PoolClient) {
    const query = async (sql: string, values: unknown[]) => client ? client.query(sql, values) : db.query(sql, values);
    if (type === 'business') {
      if (change === 'transfer') await query(`UPDATE business_profiles SET owner_user_id=$2 WHERE id=$1`, [parentId(type),nextOwner]);
      else await query(`DELETE FROM business_profiles WHERE id=$1`, [parentId(type)]);
    } else {
      // Keep the canonical composite base-profile/owner foreign key valid.
      if (change === 'transfer') await query(`UPDATE professional_profiles SET user_identifier=$2,profile_identifier=$3 WHERE professional_profile_identifier=$1`,
        [parentId(type),nextOwner,`profile_${nextOwner}`]);
      else await query(`DELETE FROM professional_profiles WHERE professional_profile_identifier=$1`, [parentId(type)]);
    }
  }
  async function until(check: () => Promise<boolean>, message: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    do { if (await check()) return; await delay(10); } while (Date.now() < deadline);
    assert.fail(message);
  }
  // Interleave after the service preflight but before the actual repository mutation.
  function crossWrite(method: 'insertOwned' | 'patchOwned', cross: () => Promise<void>) {
    return new Proxy(repository, {
      get(target, key, receiver) {
        const member = Reflect.get(target, key, receiver);
        if (typeof member !== 'function') return member;
        if (key === method) return async (...args: unknown[]) => { await cross(); return Reflect.apply(member, target, args); };
        return member.bind(target);
      }
    });
  }
  try {
    await resetCanonicalTestSchema(pool);
    for (const account of [owner,nextOwner,otherOwner]) {
      await db.query(`INSERT INTO core_user_accounts (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
        VALUES ($1,$2,'individual_user','active','active','private')`, [account,`identity_${account}`]);
      await db.query(`INSERT INTO profiles (profile_identifier,user_identifier,profile_type,display_name,lifecycle_status,visibility)
        VALUES ($1,$2,'professional_profile','RP25 test owner','active','private')`, [`profile_${account}`,account]);
    }
    const [category] = await db.query<{ code: string }>(`SELECT c.code FROM categories c WHERE c.status='active'
      AND c.parent_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories child WHERE child.parent_code=c.code) LIMIT 1`);
    assert.ok(category);
    const listing = (type: ServiceOwnerType, id = serviceId): ServiceListing => ({
      id,ownerType:type,ownerId:parentId(type),titleAr:'خدمة اختبار',titleEn:'Original title',descriptionAr:'وصف أصلي',
      categoryCode:category.code,price:15,priceCurrency:'SYP',priceType:'fixed',status:'active',isFeatured:false,
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    });
    async function reset(type: ServiceOwnerType) {
      await db.query(`DELETE FROM service_listings WHERE id LIKE 'rp25_%'`);
      await db.query(`DELETE FROM business_profiles WHERE id IN ('rp25_business','rp25_other_business')`);
      await db.query(`DELETE FROM professional_profiles WHERE professional_profile_identifier IN ('professional_profile_rp25_owner','professional_profile_rp25_other')`);
      if (type === 'business') {
        await db.query(`INSERT INTO business_profiles (id,name,owner_user_id,visibility,moderation_status,trust_status,status,category_code,city_code,country_code)
          VALUES ($1,'RP25 business',$3,'public','approved','approved','active',$5,'damascus','SY'),
                 ($2,'RP25 other business',$4,'public','approved','approved','active',$5,'damascus','SY')`,
          [parentId(type),otherParentId(type),owner,otherOwner,category.code]);
      } else {
        await db.query(`INSERT INTO professional_profiles (professional_profile_identifier,profile_identifier,user_identifier,profession_type,
          lifecycle_status,visibility,moderation_status,headline_ar,availability,city_code,country_code)
          VALUES ($1,$3,$5,'freelancer','active','public','approved','مهني اختبار','available','damascus','SY'),
                 ($2,$4,$6,'freelancer','active','public','approved','مهني آخر','available','damascus','SY')`,
          [parentId(type),otherParentId(type),`profile_${owner}`,`profile_${otherOwner}`,owner,otherOwner]);
      }
      await repository.insertOwned(listing(type),owner);
    }
    for (const type of ['business','professional'] as const) {
      const operations = [
        { name:'create',method:'insertOwned' as const,
          direct:(repo: ServiceCatalogRepository) => repo.insertOwned(listing(type,newId),owner),
          through:(service: ServiceCatalogService) => service.create(undefined,{...listing(type,newId),ownerUserId:owner}) },
        { name:'update',method:'patchOwned' as const,
          direct:(repo: ServiceCatalogRepository) => repo.patchOwned(listing(type),{titleAr:'تعديل جديد'},owner),
          through:(service: ServiceCatalogService) => service.update(undefined,serviceId,{titleAr:'تعديل جديد'}) },
        { name:'delete',method:'patchOwned' as const,
          direct:(repo: ServiceCatalogRepository) => repo.patchOwned(listing(type),{status:'inactive'},owner),
          through:(service: ServiceCatalogService) => service.delete(undefined,serviceId) }
      ];
      for (const operation of operations) {
        for (const change of ['transfer','delete'] as const) {
          await t.test(`${type} ${operation.name}: parent ${change} after preflight rejects without writing`, async () => {
            await reset(type);
            let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
            const crossed = crossWrite(operation.method,async () => {
              await changeParent(type,change); expected = await snapshot();
            });
            await assert.rejects(operation.through(serviceFor(crossed)),change === 'transfer' ? ForbiddenException : NotFoundException);
            assert.ok(expected, 'The actual mutation boundary must be reached.');
            assert.deepEqual(await snapshot(),expected);
          });
          await t.test(`${type} ${operation.name}: waits for PostgreSQL parent lock and observes committed ${change}`, async () => {
            await reset(type);
            const blocker = await pool.connect();
            let held = false;
            let pid: number | undefined;
            let settled = false;
            let pending: Promise<{ error?: unknown }> | undefined;
            const observed = {
              transaction: <T>(write: (client: PoolClient) => Promise<T>): Promise<T> => db.transaction(async client => {
                const result = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
                pid = result.rows[0].pid;
                return write(client);
              })
            } as unknown as DatabasePool;
            try {
              await blocker.query('BEGIN'); held = true;
              await blocker.query(parentSql(type),[parentId(type)]);
              pending = operation.direct(new ServiceCatalogRepository(observed)).then(
                () => { settled = true; return {}; }, error => { settled = true; return {error}; }
              );
              await until(async () => pid !== undefined || settled,'Writer did not enter a transaction.');
              assert.ok(pid);
              await until(async () => {
                assert.equal(settled,false,'Writer bypassed the held parent lock.');
                const [activity] = await db.query<{ wait_event_type: string | null }>(`SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1`,[pid]);
                return activity?.wait_event_type === 'Lock';
              },'Writer did not wait on a real PostgreSQL lock.');
              await changeParent(type,change,blocker);
              const expected = await snapshot(blocker);
              await blocker.query('COMMIT'); held = false;
              const outcome = await pending;
              assert.ok(outcome.error instanceof (change === 'transfer' ? ForbiddenException : NotFoundException));
              assert.deepEqual(await snapshot(),expected);
            } finally {
              if (held) await blocker.query('ROLLBACK');
              await pending;
              blocker.release();
            }
          });
        }
      }
      for (const operation of operations.filter(item => item.name !== 'create')) {
        await t.test(`${type} ${operation.name}: a deleted service is never recreated`,async () => {
          await reset(type);
          const crossed = crossWrite('patchOwned',async () => { await db.query(`DELETE FROM service_listings WHERE id=$1`,[serviceId]); });
          await assert.rejects(operation.through(serviceFor(crossed)),NotFoundException);
          assert.equal(await repository.findById(serviceId),undefined);
        });
        await t.test(`${type} ${operation.name}: moving a service cannot reuse the previous parent's authorization`,async () => {
          await reset(type);
          let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
          const crossed = crossWrite('patchOwned',async () => {
            await db.query(`UPDATE service_listings SET owner_id=$2 WHERE id=$1`,[serviceId,otherParentId(type)]);
            expected = await snapshot();
          });
          await assert.rejects(operation.through(serviceFor(crossed)),ConflictException);
          assert.deepEqual(await snapshot(),expected);
        });
      }
      await t.test(`${type}: authorized create returns persisted category metadata and no actor identity`,async () => {
        await reset(type);
        const saved = await serviceFor(repository).create(undefined,{...listing(type,newId),ownerUserId:owner});
        assert.ok(saved.categoryNameAr);
        assert.equal('ownerUserId' in saved,false);
        const stored = await repository.findById(saved.id);
        assert.ok(stored); assert.equal(stored.titleAr,saved.titleAr); assert.equal(stored.createdAt,saved.createdAt);
      });
      await t.test(`${type}: concurrent patches preserve both disjoint submitted fields`,async () => {
        await reset(type);
        await Promise.all([
          repository.patchOwned(listing(type),{titleAr:'عنوان أحدث'},owner),
          repository.patchOwned(listing(type),{descriptionAr:'وصف أحدث'},owner)
        ]);
        const stored = (await repository.findById(serviceId))!;
        assert.equal(stored.titleAr,'عنوان أحدث'); assert.equal(stored.descriptionAr,'وصف أحدث');
        assert.equal(stored.price,15); assert.equal(stored.status,'active');
      });
      await t.test(`${type}: deactivation preserves a newer edit and repeated deletion remains authorized`,async () => {
        await reset(type);
        const crossed = crossWrite('patchOwned',async () => {
          await db.query(`UPDATE service_listings SET title_ar='عنوان متزامن',price=27,is_featured=TRUE,featured_at=clock_timestamp() WHERE id=$1`,[serviceId]);
        });
        assert.deepEqual(await serviceFor(crossed).delete(undefined,serviceId),{status:'ok'});
        assert.deepEqual(await serviceFor(repository).delete(undefined,serviceId),{status:'ok'});
        const [stored] = await snapshot();
        assert.equal(stored.status,'inactive'); assert.equal(stored.title_ar,'عنوان متزامن');
        assert.equal(Number(stored.price),27); assert.equal(stored.is_featured,true);
      });
      await t.test(`${type}: stale edit does not reactivate a service deactivated during preflight`,async () => {
        await reset(type);
        const crossed = crossWrite('patchOwned',async () => {
          await db.query(`UPDATE service_listings SET status='inactive' WHERE id=$1`,[serviceId]);
        });
        const saved = await serviceFor(crossed).update(undefined,serviceId,{titleAr:'عنوان محفوظ'});
        assert.equal(saved.status,'inactive'); assert.equal(saved.titleAr,'عنوان محفوظ');
      });
      await t.test(`${type}: insert collision cannot overwrite another parent's service`,async () => {
        await reset(type);
        await db.query(`UPDATE service_listings SET owner_id=$2 WHERE id=$1`,[serviceId,otherParentId(type)]);
        const before = await snapshot();
        await assert.rejects(repository.insertOwned({...listing(type),titleAr:'تعديل ممنوع'},owner),ConflictException);
        assert.deepEqual(await snapshot(),before);
      });
      await t.test(`${type}: failed patch rolls back and the current owner can write after transfer`,async () => {
        await reset(type); const before = await snapshot();
        await assert.rejects(repository.patchOwned(listing(type),{titleAr:'غير محفوظ',categoryCode:'rp25_missing_category'},owner),
          (error: any) => error.code === '23503');
        assert.deepEqual(await snapshot(),before);
        await changeParent(type,'transfer');
        await assert.rejects(repository.patchOwned(listing(type),{titleAr:'مالك قديم'},owner),ForbiddenException);
        const saved = await repository.patchOwned(listing(type),{titleAr:'المالك الحالي'},nextOwner);
        assert.equal(saved.titleAr,'المالك الحالي');
      });
      await t.test(`${type}: patches preserve featured metadata and cannot move update time backwards`,async () => {
        await reset(type);
        const [old] = await db.query<{ stamp: string }>(`UPDATE service_listings SET is_featured=TRUE,featured_at=clock_timestamp(),
          updated_at=clock_timestamp()+interval '1 day' WHERE id=$1 RETURNING updated_at::text AS stamp`,[serviceId]);
        const saved = await repository.patchOwned(listing(type),{titleAr:'عنوان فقط'},owner);
        assert.equal(saved.isFeatured,true); assert.ok(saved.featuredAt);
        const [comparison] = await db.query<{ newer: boolean }>(`SELECT updated_at>$2::timestamptz AS newer FROM service_listings WHERE id=$1`,[serviceId,old.stamp]);
        assert.equal(comparison.newer,true);
      });
    }
  } finally { await pool.end(); }
});
