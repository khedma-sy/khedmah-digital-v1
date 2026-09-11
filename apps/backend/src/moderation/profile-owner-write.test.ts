import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { ProfessionalProfileRepository } from '../professional-profiles/professional-profile.repository';
import { BusinessProfileService } from '../business-profiles/business-profile.service';
import { ProfessionalProfileService } from '../professional-profiles/professional-profile.service';

test('owner profile drafts compare content atomically on PostgreSQL', async (t) => {
  const pool = createTestPool(); const db = DatabasePool.fromPool(pool);
  try {
    await resetCanonicalTestSchema(pool);
    const accounts = new IdentityRepository(db); const now = new Date().toISOString();
    for (const id of ['draft_owner','draft_other']) {
      await accounts.saveAccount({id,email:`${id}@example.test`,passwordHash:'fixture-not-a-login',status:'active',createdAt:now,updatedAt:now});
      await accounts.saveProfile({userId:id,displayName:id,locale:'ar',createdAt:now,updatedAt:now});
    }
    const identity = {getCurrentUser:async()=>({id:'draft_owner'})} as any;
    const businesses = new BusinessProfileRepository(db); const professionals = new ProfessionalProfileRepository(db);
    const businessService = new BusinessProfileService(businesses,identity,{} as any,{assertActiveCategory:async()=>{}} as any);
    const professionalService = new ProfessionalProfileService(professionals,identity,{} as any);
    const [category] = await db.query<{code:string}>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`);
    const business = await businessService.create(undefined,{name:'نشاط نسخة المالك',categoryCode:category.code,cityCode:'damascus',countryCode:'SY'});
    const professionalInput = {headlineAr:'مهني نسخة المالك',cityCode:'damascus',countryCode:'SY',skills:['خبرة']};
    const creates = await Promise.allSettled([professionalService.createOrUpdate(undefined,professionalInput),professionalService.createOrUpdate(undefined,professionalInput)]);
    assert.equal(creates.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(creates.filter(x=>x.status==='rejected' && x.reason instanceof ConflictException).length,1);
    const professional = (await professionals.findByUserId('draft_owner'))!;
    for (const kind of ['business','professional'] as const) {
      const id = kind==='business' ? business.id : professional.id;
      const repo = kind==='business' ? businesses : professionals;
      const table = kind==='business' ? 'business_profiles' : 'professional_profiles';
      const key = kind==='business' ? 'id' : 'professional_profile_identifier';
      const read = async () => (await repo.findById(id))!;
      const write = async (snapshot:any, name:string, actor='draft_owner') => kind==='business'
        ? businesses.updateOwner({...snapshot,name},snapshot.contentRevision,actor)
        : professionals.updateOwner({...snapshot,headlineAr:name},snapshot.contentRevision,actor);
      await t.test(`${kind}: two old tabs have exactly one successful content change`,async()=>{
        const before = await read(); assert.match(before.contentRevision!,/^[a-f0-9]{64}$/);
        const results = await Promise.allSettled([write(before,'حفظ من التبويب الأول'),write(before,'حفظ من التبويب الثاني')]);
        assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
        assert.equal(results.filter(x=>x.status==='rejected' && x.reason instanceof ConflictException).length,1);
        assert.notEqual((await read()).contentRevision,before.contentRevision);
        await assert.rejects(()=>write(before,'حفظ متأخر'),ConflictException);
      });
      await t.test(`${kind}: moderation and media clocks do not invalidate an owner draft`,async()=>{
        const before = await read();
        await db.query(`UPDATE ${table} SET moderation_status='suspended',is_featured=TRUE,updated_at=clock_timestamp() WHERE ${key}=$1`,[id]);
        assert.equal((await read()).contentRevision,before.contentRevision);
        const saved = await write(before,'تعديل بعد قرار إداري');
        assert.equal(saved.isFeatured,true);
        const [row] = await db.query<{moderation_status:string}>(`SELECT moderation_status FROM ${table} WHERE ${key}=$1`,[id]);
        assert.equal(row.moderation_status,'suspended'); assert.equal(saved.contentRevision,(await read()).contentRevision);
      });
      await t.test(`${kind}: unchanged save preserves the fingerprint`,async()=>{
        const before:any=await read();const result=await write(before,kind==='business'?before.name:before.headlineAr);
        assert.equal(result.contentRevision,before.contentRevision);
      });
      await t.test(`${kind}: actor predicate protects a correctly versioned write`,async()=>{
        const before=await read();await assert.rejects(()=>write(before,'تعديل غير مصرح','draft_other'),ConflictException);
        assert.equal((await read()).contentRevision,before.contentRevision);
      });
      await t.test(`${kind}: service rejects stale and missing revisions before overwriting`,async()=>{
        const before=await read();
        if(kind==='business') {
          await assert.rejects(()=>businessService.update(undefined,id,{name:'غير محمي'}),BadRequestException);
          await assert.rejects(()=>businessService.update(undefined,id,{name:'نسخة قديمة',expectedContentRevision:'0'.repeat(64)}),ConflictException);
        } else {
          await assert.rejects(()=>professionalService.createOrUpdate(undefined,professionalInput),ConflictException);
          await assert.rejects(()=>professionalService.createOrUpdate(undefined,{...professionalInput,expectedContentRevision:'0'.repeat(64)}),ConflictException);
        }
        assert.equal((await read()).contentRevision,before.contentRevision);
      });
      await t.test(`${kind}: an owner update cannot recreate a deleted record`,async()=>{
        const before=await read();await db.query(`DELETE FROM ${table} WHERE ${key}=$1`,[id]);
        await assert.rejects(()=>write(before,'لا تعاد الإنشاء'),ConflictException);assert.equal(await repo.findById(id),undefined);
        if(kind==='professional') await assert.rejects(()=>professionalService.createOrUpdate(undefined,{...professionalInput,expectedContentRevision:before.contentRevision}),ConflictException);
      });
    }
  } finally { await pool.end(); }
});
