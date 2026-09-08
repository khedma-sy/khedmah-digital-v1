import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { ProfessionalProfileRepository } from '../professional-profiles/professional-profile.repository';
import { BusinessProfileService } from '../business-profiles/business-profile.service';
import { ProfessionalProfileService } from '../professional-profiles/professional-profile.service';
import { IdentityRepository } from '../identity/identity.repository';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { writeProfileReview, writeBusinessTrust, writeProfessionalSuspension } from './profile-review-write';

test('profile decisions bind exact revisions and atomic history on PostgreSQL', async (t) => {
  const pool=createTestPool();const db=DatabasePool.fromPool(pool);
  const previous=process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  try {
    await resetCanonicalTestSchema(pool);
    const identityRepo=new IdentityRepository(db);const now=new Date().toISOString();
    for(const id of ['review_owner','review_moderator']) {
      await identityRepo.saveAccount({id,email:`${id}@example.test`,passwordHash:'fixture-not-a-login',status:'active',createdAt:now,updatedAt:now});
      await identityRepo.saveProfile({userId:id,displayName:id,locale:'ar',createdAt:now,updatedAt:now});
    }
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS=JSON.stringify({'review_moderator@example.test':['security_operations_engineer']});
    let actor='review_owner';
    const identity={getCurrentUser:async()=>({id:actor,email:`${actor}@example.test`})} as any;
    const rbac=new OperationsRbacService();
    const businesses=new BusinessProfileRepository(db), professionals=new ProfessionalProfileRepository(db);
    const businessService=new BusinessProfileService(businesses,identity,rbac,{assertActiveCategory:async()=>{}} as any);
    const professionalService=new ProfessionalProfileService(professionals,identity,rbac);
    const [category]=await db.query<{code:string}>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`);
    assert.ok(category);
    const business=await businessService.create(undefined,{name:'نشاط مراجعة',categoryCode:category.code,cityCode:'damascus',countryCode:'SY'});
    const professional=await professionalService.createOrUpdate(undefined,{headlineAr:'مهني مراجعة',cityCode:'damascus',countryCode:'SY',skills:['خبرة']});
    assert.equal((await professionalService.getMine(undefined)).contactEligibility?.lifecycleStatus,'created');
    for(const kind of ['business','professional'] as const){
      const id=kind==='business'?business.id:professional.id;
      const table=kind==='business'?'business_profiles':'professional_profiles';
      const key=kind==='business'?'id':'professional_profile_identifier';
      const repo=kind==='business'?businesses:professionals;
      const service=kind==='business'?businessService:professionalService;
      async function reset(){
        actor='review_moderator';
        await db.query(`DELETE FROM trust_history WHERE entity_type=$1 AND entity_id=$2`,[kind,id]);
        await db.query(`UPDATE ${table} SET moderation_status='pending',visibility='public',updated_at=clock_timestamp(),${kind==='business'?"trust_status='approved',status='active'":"lifecycle_status='pending'"} WHERE ${key}=$1`,[id]);
        return (await repo.findById(id))!;
      }
      await t.test(`${kind}: missing revisions and unauthorized reviewers cannot write`,async()=>{
        const before=await reset();
        await assert.rejects(()=>service.approveModeration(undefined,id),BadRequestException);
        await assert.rejects(()=>service.rejectModeration(undefined,id,'x',before.revision),BadRequestException);
        actor='review_owner';await assert.rejects(()=>service.approveModeration(undefined,id,before.revision),ForbiddenException);
        assert.equal((await repo.findById(id))!.revision,before.revision);
      });
      await t.test(`${kind}: edit after the displayed queue version rejects the old decision`,async()=>{
        const before=await reset();
        if(kind==='business')await businesses.save({...await businesses.findById(id)!,name:'تعديل بعد العرض'});
        else await professionals.save({...await professionals.findById(id)!,headlineAr:'تعديل بعد العرض'});
        await assert.rejects(()=>service.approveModeration(undefined,id,before.revision),ConflictException);
        const current=(await repo.findById(id))!;
        assert.notEqual(current.revision,before.revision);
        assert.match(current.revision!,/\.\d{6}Z$/);
      });
      await t.test(`${kind}: simultaneous decisions have one winner and one history entry`,async()=>{
        const before=await reset();
        const outcomes=await Promise.allSettled([service.approveModeration(undefined,id,before.revision),service.rejectModeration(undefined,id,'سبب اختبار واضح',before.revision)]);
        assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
        assert.equal(outcomes.filter(o=>o.status==='rejected'&&o.reason instanceof ConflictException).length,1);
        const [count]=await db.query<{count:string}>(`SELECT count(*) FROM trust_history WHERE entity_type=$1 AND entity_id=$2`,[kind,id]);assert.equal(count.count,'1');
      });
      await t.test(`${kind}: a history-write failure rolls back the decision`,async()=>{
        const before=await reset();
        await assert.rejects(()=>writeProfileReview(db,kind,id,'missing_review_actor',{status:'approved',expectedRevision:before.revision}));
        assert.equal((await repo.findById(id))!.revision,before.revision);
        if(kind==='professional')assert.equal((await professionals.findContactEligibility(id))!.lifecycleStatus,'pending');
      });
      await t.test(`${kind}: edited approved content becomes pending and stays out of public reads`,async()=>{
        const before=await reset();await service.approveModeration(undefined,id,before.revision);
        if(kind==='business'){
          const current=(await businesses.findById(id))!;await businesses.save({...current,descriptionAr:'محتوى جديد للمراجعة'});
          assert.equal((await businesses.findById(id))!.moderationStatus,'pending');
          await assert.rejects(()=>businessService.getPublic(id));
        }else{
          const current=(await professionals.findById(id))!;await professionals.save({...current,bioAr:'محتوى جديد للمراجعة'});
          assert.equal((await professionals.findContactEligibility(id))!.moderationStatus,'pending');
          await assert.rejects(()=>professionalService.getProfile(id));
        }
      });
      await t.test(`${kind}: owner cannot lift suspension by resubmitting or editing`,async()=>{
        await reset();await db.query(`UPDATE ${table} SET moderation_status='suspended' WHERE ${key}=$1`,[id]);
        actor='review_owner';await assert.rejects(()=>service.submitForReview(undefined,id),ConflictException);
        if(kind==='business'){
          await businesses.save({...await businesses.findById(id)!,name:'تعديل ملف موقوف'});assert.equal((await businesses.findById(id))!.moderationStatus,'suspended');
        }else{
          await professionals.save({...await professionals.findById(id)!,headlineAr:'تعديل ملف موقوف'});assert.equal((await professionals.findContactEligibility(id))!.moderationStatus,'suspended');
        }
      });
      await t.test(`${kind}: duplicate pending submissions add no duplicate history`,async()=>{
        await reset();await db.query(`UPDATE ${table} SET moderation_status='rejected' WHERE ${key}=$1`,[id]);
        actor='review_owner';await Promise.all([service.submitForReview(undefined,id),service.submitForReview(undefined,id)]);
        const [count]=await db.query<{count:string}>(`SELECT count(*) FROM trust_history WHERE entity_type=$1 AND entity_id=$2`,[kind,id]);assert.equal(count.count,'1');
      });
    }
    async function resetTrust(status='pending'){
      actor='review_moderator';await db.query(`DELETE FROM trust_history WHERE entity_type='business' AND entity_id=$1`,[business.id]);
      await db.query(`UPDATE business_profiles SET trust_status=$2 WHERE id=$1`,[business.id,status]);return (await businesses.findById(business.id))!;
    }
    for(const action of ['update','verify','suspend','reactivate']){
      await t.test(`business ${action}: decision and its current-state history are committed together`,async()=>{
        const before=await resetTrust(action==='reactivate'?'suspended':action==='suspend'?'approved':'pending');
        const result=action==='update'?await businessService.updateTrustStatus(undefined,business.id,{trustStatus:'approved'}):action==='verify'?await businessService.approveVerification(undefined,business.id):action==='suspend'?await businessService.suspendBusiness(undefined,business.id,'سبب الإيقاف'):await businessService.reactivateBusiness(undefined,business.id);
        const history=await businesses.listTrustHistory('business',business.id);assert.equal(history.length,1);assert.equal(history[0].oldStatus,before.trustStatus);assert.equal(history[0].newStatus,result.trustStatus);assert.equal(history[0].changedBy,'review_moderator');assert.equal(result.revision,(await businesses.findById(business.id))!.revision);
      });
    }
    await t.test('business trust history failure rolls back the status and exact revision',async()=>{
      const before=await resetTrust();await assert.rejects(()=>writeBusinessTrust(db,business.id,'missing_review_actor','approved'));
      const current=(await businesses.findById(business.id))!;assert.equal(current.trustStatus,'pending');assert.equal(current.revision,before.revision);
    });
    await t.test('concurrent trust decisions produce a contiguous history rather than two stale old states',async()=>{
      await resetTrust();await Promise.all([businessService.updateTrustStatus(undefined,business.id,{trustStatus:'approved'}),businessService.suspendBusiness(undefined,business.id,'سبب واضح')]);
      const history=(await businesses.listTrustHistory('business',business.id)).reverse();assert.equal(history.length,2);assert.equal(history[0].oldStatus,'pending');assert.equal(history[1].oldStatus,history[0].newStatus);assert.equal(history[1].newStatus,(await businesses.findById(business.id))!.trustStatus);
    });
    await t.test('duplicate trust decisions are idempotent under concurrency',async()=>{
      await resetTrust();await Promise.all([businessService.approveVerification(undefined,business.id),businessService.approveVerification(undefined,business.id)]);assert.equal((await businesses.listTrustHistory('business',business.id)).length,1);
    });
    await t.test('ordinary owner cannot use any administrative trust or suspension route',async()=>{
      actor='review_owner';for(const call of [()=>businessService.updateTrustStatus(undefined,business.id,{trustStatus:'approved'}),()=>businessService.approveVerification(undefined,business.id),()=>businessService.suspendBusiness(undefined,business.id,'سبب'),()=>businessService.reactivateBusiness(undefined,business.id),()=>professionalService.suspendProfessional(undefined,professional.id,'سبب')])await assert.rejects(call,ForbiddenException);
    });
    async function resetProfessional(){actor='review_moderator';await db.query(`DELETE FROM trust_history WHERE entity_type='professional' AND entity_id=$1`,[professional.id]);await db.query(`UPDATE professional_profiles SET moderation_status='approved',lifecycle_status='active' WHERE professional_profile_identifier=$1`,[professional.id]);return (await professionals.findById(professional.id))!;}
    await t.test('professional suspension rolls back both states when history fails',async()=>{
      const before=await resetProfessional();await assert.rejects(()=>writeProfessionalSuspension(db,professional.id,'missing_review_actor','سبب واضح'));
      const eligibility=(await professionals.findContactEligibility(professional.id))!;assert.equal(eligibility.moderationStatus,'approved');assert.equal(eligibility.lifecycleStatus,'active');assert.equal((await professionals.findById(professional.id))!.revision,before.revision);
    });
    await t.test('concurrent professional suspensions have one consistent state and one history entry',async()=>{
      await resetProfessional();await Promise.all([professionalService.suspendProfessional(undefined,professional.id,'سبب واضح'),professionalService.suspendProfessional(undefined,professional.id,'سبب واضح')]);
      const eligibility=(await professionals.findContactEligibility(professional.id))!;assert.equal(eligibility.moderationStatus,'suspended');assert.equal(eligibility.lifecycleStatus,'suspended');const history=await professionals.listTrustHistory(professional.id);assert.equal(history.length,1);assert.equal(history[0].oldStatus,'approved');
    });
    await t.test('suspension does not move an archived professional back into a live lifecycle',async()=>{
      await resetProfessional();await db.query(`UPDATE professional_profiles SET lifecycle_status='archived',archived_at=clock_timestamp() WHERE professional_profile_identifier=$1`,[professional.id]);await assert.rejects(()=>professionalService.suspendProfessional(undefined,professional.id,'سبب واضح'),ConflictException);
      assert.equal((await professionals.findContactEligibility(professional.id))!.lifecycleStatus,'archived');
    });
  }finally{
    if(previous===undefined)delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;else process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS=previous;
    await pool.end();
  }
});
