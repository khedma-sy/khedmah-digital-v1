import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { BusinessProfileRepository } from './business-profile.repository';
import { BusinessProfileService } from './business-profile.service';

test('business creation recovers an account-scoped attempt on PostgreSQL',async(t)=>{
  const pool=createTestPool();const db=DatabasePool.fromPool(pool);
  try{
    await resetCanonicalTestSchema(pool);
    for(const owner of ['create_owner','create_other'])await db.query(`INSERT INTO core_user_accounts (user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification) VALUES ($1,$2,'individual_user','active','active','private')`,[owner,`identity_${owner}`]);
    let actor='create_owner';let categoryAvailable=true;
    const repository=new BusinessProfileRepository(db);const service=new BusinessProfileService(repository,{getCurrentUser:async()=>({id:actor})} as any,{} as any,{assertActiveCategory:async()=>{if(!categoryAvailable)throw new BadRequestException('inactive');}} as any);
    const [category]=await db.query<{code:string}>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`);
    const input={name:'نشاط إعادة المحاولة',descriptionAr:'بيانات صحيحة',categoryCode:category.code,cityCode:'damascus',countryCode:'SY',clientRequestId:'same-business-attempt-123456'};
    const first=await service.create(undefined,input);
    await t.test('lost response replay returns the existing identity without another row',async()=>{
      const replay=await service.create(undefined,input);assert.equal(replay.id,first.id);assert.equal(replay.revision,first.revision);assert.equal((await repository.listForUser(actor)).length,1);
    });
    await t.test('simultaneous inserts on one key return one stored business',async()=>{
      const results=await Promise.all([service.create(undefined,{...input,clientRequestId:'simultaneous-attempt-123456'}),service.create(undefined,{...input,clientRequestId:'simultaneous-attempt-123456'})]);
      assert.equal(results[0].id,results[1].id);assert.equal(results[0].contentRevision,results[1].contentRevision);assert.equal((await repository.listForUser(actor)).length,2);
    });
    await t.test('changed data on a known key conflicts with a resume identity and never overwrites',async()=>{
      await assert.rejects(()=>service.create(undefined,{...input,name:'تعديل غير مؤكد'}),(error:unknown)=>error instanceof ConflictException && (error.getResponse() as any).businessId===first.id);
      assert.equal((await repository.findById(first.id))!.name,input.name);
    });
    await t.test('a known replay survives category deactivation and preserves moderation decisions',async()=>{
      categoryAvailable=false;await db.query(`UPDATE business_profiles SET moderation_status='approved',trust_status='suspended',is_featured=TRUE WHERE id=$1`,[first.id]);
      const result=await service.create(undefined,input);assert.equal(result.moderationStatus,'approved');assert.equal(result.trustStatus,'suspended');assert.equal(result.isFeatured,true);categoryAvailable=true;
    });
    await t.test('another account cannot bind the same client key to the original business',async()=>{
      actor='create_other';const result=await service.create(undefined,input);assert.notEqual(result.id,first.id);assert.equal((await repository.findById(result.id))!.ownerUserId,actor);actor='create_owner';
    });
    await t.test('malformed request identities cannot create rows',async()=>{
      for(const clientRequestId of ['',null,12,'short','x'.repeat(101)])await assert.rejects(()=>service.create(undefined,{...input,clientRequestId}),BadRequestException);
    });
    await t.test('legacy callers without a key retain explicit separate creations',async()=>{
      const a=await service.create(undefined,{...input,clientRequestId:undefined});const b=await service.create(undefined,{...input,clientRequestId:undefined});assert.notEqual(a.id,b.id);
    });
    await t.test('a moved business cannot be recovered by its previous owner',async()=>{
      await db.query(`UPDATE business_profiles SET owner_user_id='create_other' WHERE id=$1`,[first.id]);await assert.rejects(()=>service.create(undefined,input),ForbiddenException);
    });
  }finally{await pool.end();}
});
