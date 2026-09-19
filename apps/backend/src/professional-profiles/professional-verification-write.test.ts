import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import { ProfessionalProfileRepository } from './professional-profile.repository';
import { ProfessionalProfileService } from './professional-profile.service';

test('professional verification requests serialize on the owned parent in PostgreSQL',async(t)=>{
  const pool=createTestPool();const db=DatabasePool.fromPool(pool);
  try{
    await resetCanonicalTestSchema(pool);const identities=new IdentityRepository(db);const now=new Date().toISOString();
    for(const id of ['verify_owner','verify_other']){await identities.saveAccount({id,email:`${id}@example.test`,passwordHash:'fixture-not-a-login',status:'active',createdAt:now,updatedAt:now});await identities.saveProfile({userId:id,displayName:id,locale:'ar',createdAt:now,updatedAt:now});}
    const repository=new ProfessionalProfileRepository(db);let actor='verify_owner';const service=new ProfessionalProfileService(repository,{getCurrentUser:async()=>({id:actor})} as any,{} as any);
    const profile=await service.createOrUpdate(undefined,{headlineAr:'مهني توثيق',cityCode:'damascus',countryCode:'SY'});
    let request=await service.requestVerification(undefined,profile.id);
    await t.test('repeated and concurrent owner requests return one pending record',async()=>{
      const results=await Promise.all([service.requestVerification(undefined,profile.id),service.requestVerification(undefined,profile.id)]);assert.equal(results[0].id,request.id);assert.equal(results[1].id,request.id);
      const [row]=await db.query<{count:string}>(`SELECT count(*) FROM verification_requests WHERE entity_type='professional' AND entity_id=$1`,[profile.id]);assert.equal(row.count,'1');
    });
    await t.test('an approved request is preserved rather than replaced or downgraded',async()=>{
      await db.query(`UPDATE verification_requests SET status='approved',reviewed_by='verify_other',reviewed_at=clock_timestamp() WHERE id=$1`,[request.id]);const result=await service.requestVerification(undefined,profile.id);assert.equal(result.id,request.id);assert.equal(result.status,'approved');
      assert.equal((await repository.findContactEligibility(profile.id))!.lifecycleStatus,'created'); // Verification does not grant publication.
    });
    await t.test('after rejection simultaneous resubmissions create exactly one new pending request',async()=>{
      await db.query(`UPDATE verification_requests SET status='rejected' WHERE id=$1`,[request.id]);const oldId=request.id;
      const results=await Promise.all([service.requestVerification(undefined,profile.id),service.requestVerification(undefined,profile.id)]);request=results[0];assert.notEqual(request.id,oldId);assert.equal(results[1].id,request.id);assert.equal(request.status,'pending');
      const [row]=await db.query<{count:string}>(`SELECT count(*) FROM verification_requests WHERE entity_type='professional' AND entity_id=$1 AND status='pending'`,[profile.id]);assert.equal(row.count,'1');
    });
    await t.test('repository ownership guard rejects a forged requester without inserting',async()=>{
      await assert.rejects(()=>repository.requestVerification({...request,id:'forged-request',requesterId:'verify_other'}),ForbiddenException);assert.equal((await repository.findVerificationRequest(profile.id))!.id,request.id);
      actor='verify_other';await assert.rejects(()=>service.requestVerification(undefined,profile.id),ForbiddenException);actor='verify_owner';
    });
    await t.test('private owner can recover the sanitized status but public callers cannot',async()=>{
      const status=await service.getVerificationStatus(profile.id,'khedmah_session=valid');assert.equal(status!.status,'pending');assert.equal('requesterId' in status!,false);await assert.rejects(()=>service.getVerificationStatus(profile.id),NotFoundException);
    });
    await t.test('missing parent cannot leave an orphan verification request',async()=>{
      await db.query(`DELETE FROM professional_profiles WHERE professional_profile_identifier=$1`,[profile.id]);await assert.rejects(()=>repository.requestVerification({...request,id:'orphan-request'}),NotFoundException);
      assert.equal((await db.query(`SELECT id FROM verification_requests WHERE id='orphan-request'`)).length,0);
    });
  }finally{await pool.end();}
});
