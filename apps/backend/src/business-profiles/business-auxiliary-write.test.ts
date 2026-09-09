import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { BusinessProfileRepository } from './business-profile.repository';
import { BusinessProfileService } from './business-profile.service';
import type { BusinessBranch, BusinessSocialLink, OpeningHours } from './business-profile.types';

// Actual SQL and row locks on the explicitly disposable canonical PostgreSQL schema.
test('business auxiliary writes retain current parent ownership through commit', { timeout: 60_000 }, async (t) => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  const owner = 'rp24_owner';
  const nextOwner = 'rp24_next_owner';
  const business = 'rp24_business';
  const otherBusiness = 'rp24_other_business';
  const repository = new BusinessProfileRepository(db);
  const hours = (prefix: string, openTime = '09:00', closeTime = '17:00'): OpeningHours[] =>
    Array.from({ length: 7 }, (_, dayOfWeek) => ({
      id: `${prefix}_${dayOfWeek}`, businessProfileId: business, dayOfWeek, openTime, closeTime, isClosed: false
    }));
  const branch: BusinessBranch = { id: 'rp24_branch', businessProfileId: business, nameAr: 'فرع اختبار', cityCode: 'damascus', isMain: false };
  const link: BusinessSocialLink = { id: 'rp24_new_link', businessProfileId: business, platform: 'facebook', url: 'https://example.test/new' };
  type Operation = {
    name: string;
    method: 'replaceOpeningHours' | 'saveBranch' | 'saveSocialLink' | 'deleteSocialLink';
    write: (repo: BusinessProfileRepository, actorId: string) => Promise<void>;
    throughService: (service: BusinessProfileService) => Promise<unknown>;
  };
  const operations: Operation[] = [
    { name: 'hours', method: 'replaceOpeningHours', write: (repo, actor) => repo.replaceOpeningHours(business, hours('new'), actor),
      throughService: service => service.setOpeningHours(undefined, business, hours('new')) },
    { name: 'branch', method: 'saveBranch', write: (repo, actor) => repo.saveBranch(branch, actor),
      throughService: service => service.addBranch(undefined, business, branch) },
    { name: 'social link', method: 'saveSocialLink', write: (repo, actor) => repo.saveSocialLink(link, actor),
      throughService: service => service.setSocialLink(undefined, business, link.platform, link.url) },
    { name: 'social deletion', method: 'deleteSocialLink', write: (repo, actor) => repo.deleteSocialLink(business, 'rp24_existing_link', actor),
      throughService: service => service.deleteSocialLink(undefined, business, 'rp24_existing_link') }
  ];
  const serviceFor = (repo: BusinessProfileRepository) => new BusinessProfileService(
    repo, { getCurrentUser: async () => ({ id: owner }) } as any, {} as any, {} as any
  );
  async function snapshot() {
    return Promise.all([
      db.query(`SELECT * FROM business_opening_hours WHERE business_profile_id IN ($1,$2) ORDER BY id`, [business, otherBusiness]),
      db.query(`SELECT * FROM business_branches WHERE business_profile_id IN ($1,$2) ORDER BY id`, [business, otherBusiness]),
      db.query(`SELECT * FROM business_social_links WHERE business_profile_id IN ($1,$2) ORDER BY id`, [business, otherBusiness])
    ]);
  }
  // Poll a PostgreSQL-observed lock, not a guessed sleep duration or a mocked SQL result.
  async function until(check: () => Promise<boolean>, message: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    do { if (await check()) return; await delay(10); } while (Date.now() < deadline);
    assert.fail(message);
  }
  try {
    await resetCanonicalTestSchema(pool);
    await db.query(`INSERT INTO core_user_accounts (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
      VALUES ($1,'rp24_identity_owner','individual_user','active','active','private'),
             ($2,'rp24_identity_next','individual_user','active','active','private')`, [owner, nextOwner]);
    const [category] = await db.query<{ code: string }>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`);
    assert.ok(category);
    async function reset() {
      await db.query(`DELETE FROM business_profiles WHERE id IN ($1,$2)`, [business, otherBusiness]);
      await db.query(`INSERT INTO business_profiles (id,name,owner_user_id,visibility,moderation_status,trust_status,status,category_code,city_code,country_code)
        VALUES ($1,'RP24 test business',$3,'public','approved','approved','active',$5,'damascus','SY'),
               ($2,'RP24 other business',$4,'public','approved','approved','active',$5,'damascus','SY')`,
        [business, otherBusiness, owner, nextOwner, category.code]);
      await repository.replaceOpeningHours(business, hours('initial'), owner);
      await repository.saveSocialLink({ id: 'rp24_existing_link', businessProfileId: business, platform: 'facebook', url: 'https://example.test/initial' }, owner);
    }
    for (const operation of operations) {
      await t.test(`${operation.name}: service cannot use ownership read before a transfer`, async () => {
        await reset(); const before = await snapshot();
        const crossing = new Proxy(repository, {
          get(target, key, receiver) {
            const member = Reflect.get(target, key, receiver);
            if (typeof member !== 'function') return member;
            if (key === operation.method) return async (...args: unknown[]) => {
              await db.query(`UPDATE business_profiles SET owner_user_id=$2 WHERE id=$1`, [business, nextOwner]);
              return Reflect.apply(member, target, args);
            };
            return member.bind(target);
          }
        });
        await assert.rejects(operation.throughService(serviceFor(crossing)), ForbiddenException);
        assert.deepEqual(await snapshot(), before);
      });
      await t.test(`${operation.name}: a parent deleted after preflight is not resurrected`, async () => {
        await reset();
        const crossing = new Proxy(repository, {
          get(target, key, receiver) {
            const member = Reflect.get(target, key, receiver);
            if (typeof member !== 'function') return member;
            if (key === operation.method) return async (...args: unknown[]) => {
              await db.query(`DELETE FROM business_profiles WHERE id=$1`, [business]);
              return Reflect.apply(member, target, args);
            };
            return member.bind(target);
          }
        });
        await assert.rejects(operation.throughService(serviceFor(crossing)), NotFoundException);
        assert.equal(await repository.findById(business), undefined);
        assert.deepEqual(await snapshot(), [[], [], []]);
      });
      for (const change of ['transfer', 'delete'] as const) {
        await t.test(`${operation.name}: waits for a real parent lock and rejects its committed ${change}`, async () => {
          await reset(); const before = await snapshot();
          const blocker = await pool.connect();
          let held = false;
          let writerPid: number | undefined;
          let settled = false;
          let pending: Promise<{ error?: unknown }> | undefined;
          const observed = {
            query: db.query.bind(db),
            transaction: <T>(write: (client: PoolClient) => Promise<T>): Promise<T> => db.transaction(async (client) => {
              const result = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
              writerPid = result.rows[0].pid;
              return write(client);
            })
          } as unknown as DatabasePool;
          try {
            await blocker.query('BEGIN'); held = true;
            await blocker.query(`SELECT id FROM business_profiles WHERE id=$1 FOR UPDATE`, [business]);
            pending = operation.write(new BusinessProfileRepository(observed), owner).then(
              () => { settled = true; return {}; }, error => { settled = true; return { error }; }
            );
            await until(async () => writerPid !== undefined || settled, 'Writer never entered the transaction.');
            assert.ok(writerPid, 'The write bypassed the owner transaction.');
            await until(async () => {
              assert.equal(settled, false, 'The write completed while another transaction owned the parent lock.');
              const [activity] = await db.query<{ wait_event_type: string | null }>(
                `SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1`, [writerPid]
              );
              return activity?.wait_event_type === 'Lock';
            }, 'Writer did not wait for the real parent row lock.');
            if (change === 'transfer') await blocker.query(`UPDATE business_profiles SET owner_user_id=$2 WHERE id=$1`, [business, nextOwner]);
            else await blocker.query(`DELETE FROM business_profiles WHERE id=$1`, [business]);
            await blocker.query('COMMIT'); held = false;
            const outcome = await pending;
            assert.ok(outcome.error instanceof (change === 'transfer' ? ForbiddenException : NotFoundException));
            assert.deepEqual(await snapshot(), change === 'transfer' ? before : [[], [], []]);
          } finally {
            if (held) await blocker.query('ROLLBACK');
            await pending;
            blocker.release();
          }
        });
      }
    }
    await t.test('valid owner writes persist and returned hours use the authorized parent', async () => {
      await reset(); const service = serviceFor(repository);
      const returned = await service.setOpeningHours(undefined, business, hours('submitted').map(hour => ({ ...hour, businessProfileId: otherBusiness })));
      assert.equal(returned.length, 7);
      assert.ok(returned.every(hour => hour.businessProfileId === business));
      assert.ok((await repository.listOpeningHours(business)).every(hour => hour.businessProfileId === business));
      const addedBranch = await service.addBranch(undefined, business, branch);
      assert.ok((await repository.listBranches(business)).some(item => item.id === addedBranch.id));
      const addedLink = await service.setSocialLink(undefined, business, link.platform, link.url);
      assert.ok((await repository.listSocialLinks(business)).some(item => item.id === addedLink.id));
      await service.deleteSocialLink(undefined, business, addedLink.id);
      await service.deleteSocialLink(undefined, business, addedLink.id); // Existing authorized idempotent deletion contract.
      assert.equal((await repository.listSocialLinks(business)).some(item => item.id === addedLink.id), false);
    });
    await t.test('failed replacement rolls back its delete and partial inserts', async () => {
      await reset(); const before = await snapshot();
      const invalid = hours('duplicate'); invalid[1] = { ...invalid[1], id: invalid[0].id };
      await assert.rejects(repository.replaceOpeningHours(business, invalid, owner));
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('simultaneous replacements commit whole schedules without mixed or duplicate days', async () => {
      await reset();
      await Promise.all([
        repository.replaceOpeningHours(business, hours('schedule_a', '08:00', '16:00'), owner),
        repository.replaceOpeningHours(business, hours('schedule_b', '10:00', '18:00'), owner)
      ]);
      const stored = await repository.listOpeningHours(business);
      assert.equal(stored.length, 7); assert.equal(new Set(stored.map(hour => hour.dayOfWeek)).size, 7);
      const prefix = stored[0].id.startsWith('schedule_a_') ? 'schedule_a_' : 'schedule_b_';
      assert.ok(stored.every(hour => hour.id.startsWith(prefix)));
      assert.equal(new Set(stored.map(hour => hour.openTime)).size, 1);
    });
    await t.test('branch conflicts cannot overwrite a child of another authorized parent', async () => {
      await reset();
      await repository.saveBranch({ ...branch, businessProfileId: otherBusiness }, nextOwner);
      const before = await snapshot();
      await assert.rejects(repository.saveBranch({ ...branch, nameAr: 'تعديل غير مخول' }, owner), ForbiddenException);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('social conflicts and scoped deletion cannot alter another business link', async () => {
      await reset();
      await repository.saveSocialLink({ ...link, businessProfileId: otherBusiness }, nextOwner);
      const before = await snapshot();
      await assert.rejects(repository.saveSocialLink({ ...link, url: 'https://example.test/unauthorized' }, owner), ForbiddenException);
      await repository.deleteSocialLink(business, link.id, owner);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('the current owner can write after transfer without reverting administrative state', async () => {
      await reset();
      await db.query(`UPDATE business_profiles SET owner_user_id=$2,trust_status='suspended',moderation_status='suspended',status='suspended' WHERE id=$1`, [business, nextOwner]);
      for (const operation of operations) await operation.write(repository, nextOwner);
      const current = (await repository.findById(business))!;
      assert.equal(current.ownerUserId, nextOwner);
      assert.equal(current.trustStatus, 'suspended'); assert.equal(current.moderationStatus, 'suspended'); assert.equal(current.status, 'suspended');
    });
  } finally { await pool.end(); }
});
