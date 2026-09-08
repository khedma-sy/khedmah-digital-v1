import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { BusinessProfileRepository } from './business-profile.repository';
import { BusinessProfileService } from './business-profile.service';

// Real PostgreSQL, canonical disposable schema, controlled authentication and scheduling.
test('business owner writes preserve newer administrative decisions on PostgreSQL', async (t) => {
  const pool = createTestPool();
  const db = DatabasePool.fromPool(pool);
  try {
    await resetCanonicalTestSchema(pool);
    await db.query(`INSERT INTO core_user_accounts (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification)
      VALUES ('business_write_owner','identity_business_write_owner','individual_user','active','active','private')`);
    const [category] = await db.query<{ code: string }>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`);
    assert.ok(category);
    const repository = new BusinessProfileRepository(db);
    async function reset() {
      await db.query(`DELETE FROM business_profiles WHERE id='business_write_fixture'`);
      await db.query(`INSERT INTO business_profiles (id,name,owner_user_id,visibility,moderation_status,trust_status,status,category_code,city_code,country_code)
        VALUES ('business_write_fixture','نشاط اختبار','business_write_owner','public','approved','approved','active',$1,'damascus','SY')`, [category.code]);
      return (await repository.findById('business_write_fixture'))!;
    }
    await t.test('a stale owner snapshot cannot undo trust suspension or account suspension', async () => {
      const stale = await reset();
      await db.query(`UPDATE business_profiles SET trust_status='suspended',status='suspended',moderation_status='suspended' WHERE id=$1`, [stale.id]);
      await repository.save({ ...stale, name: 'اسم مصحح' });
      const current = (await repository.findById(stale.id))!;
      assert.equal(current.name, 'اسم مصحح');
      assert.equal(current.trustStatus, 'suspended'); assert.equal(current.status, 'suspended'); assert.equal(current.moderationStatus, 'suspended');
      assert.equal((await repository.listPublicApproved({}, 20, 0)).some(p => p.id === stale.id), false);
    });
    await t.test('owner edits cannot undo featured decisions or move the update clock backwards', async () => {
      const stale = await reset();
      await db.query(`UPDATE business_profiles SET is_featured=TRUE,featured_at='2026-09-08T00:00:00Z',updated_at='2999-01-01T00:00:00.123456Z' WHERE id=$1`, [stale.id]);
      await repository.save({ ...stale, descriptionAr: 'وصف مصحح' });
      const current = (await repository.findById(stale.id))!;
      assert.equal(current.isFeatured, true); assert.equal(current.featuredAt, '2026-09-08T00:00:00.000Z');
      const [clock] = await db.query<{ current: string }>(`SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS current FROM business_profiles WHERE id=$1`, [stale.id]);
      assert.equal(clock.current, '2999-01-01T00:00:00.123457Z');
    });
    await t.test('visibility-only owner changes preserve existing moderation approval', async () => {
      const stale = await reset(); await repository.save({ ...stale, visibility: 'private' });
      const current = (await repository.findById(stale.id))!;
      assert.equal(current.visibility, 'private'); assert.equal(current.moderationStatus, 'approved'); assert.equal(current.trustStatus, 'approved');
    });
    await t.test('a moderator decision during owner validation remains authoritative in the response', async () => {
      const stale = await reset();
      let entered!: () => void; let release!: () => void;
      const arrived = new Promise<void>(resolve => { entered = resolve; });
      const categories = { assertActiveCategory: async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); } };
      const service = new BusinessProfileService(repository, { getCurrentUser: async () => ({ id: stale.ownerUserId }) } as any, {} as any, categories as any);
      const [other] = await db.query<{ code: string }>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL AND code<>$1 LIMIT 1`, [category.code]);
      assert.ok(other);
      const edit = service.update(undefined, stale.id, { name: 'حفظ متزامن', categoryCode: other.code });
      await arrived;
      await repository.updateTrustStatus(stale.id, 'suspended', new Date().toISOString());
      release(); const result = await edit;
      assert.equal(result.trustStatus, 'suspended'); assert.equal(result.name, 'حفظ متزامن');
    });
  } finally { await pool.end(); }
});
