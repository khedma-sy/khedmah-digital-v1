import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {DatabasePool} from '../database/database.pool';
import {createTestPool,resetCanonicalTestSchema} from '../database/test-pool';
import {OperationsRbacService} from '../operations-product/operations-rbac.service';
import {MediaService} from './media.service';
import {LocalStorageAdapter} from './storage.adapter';
import {BusinessProfileRepository} from '../business-profiles/business-profile.repository';
import {ProfessionalProfileRepository} from '../professional-profiles/professional-profile.repository';
import type {MediaOwnerType} from './media.types';

test('media bytes and owner lists follow parent eligibility on PostgreSQL',async(t)=>{
  const pool=createTestPool();const db=DatabasePool.fromPool(pool);const previous=process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  try{
    await resetCanonicalTestSchema(pool);
    await db.query(await readFile(resolve(__dirname,'../../../../backend/migrations/versions/024_product_store.sql'),'utf8'));
    await db.query(`INSERT INTO core_user_accounts(user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification) VALUES('media_owner','identity_media_owner001','individual_user','active','active','private')`);
    await db.query(`INSERT INTO profiles(profile_identifier,user_identifier,profile_type,display_name,lifecycle_status,visibility) VALUES('profile_mediafixture001','media_owner','personal_profile','مالك صور','active','private')`);
    await db.query(`INSERT INTO professional_profiles(professional_profile_identifier,profile_identifier,user_identifier,profession_type,lifecycle_status,visibility,moderation_status,headline_ar,city_code,country_code) VALUES('professional_profile_mediafixture001','profile_mediafixture001','media_owner','freelancer','pending','private','pending','مهني صور','damascus','SY')`);
    const [category]=await db.query<{code:string}>(`SELECT code FROM categories WHERE status='active' AND parent_code IS NOT NULL LIMIT 1`);assert.ok(category);
    await db.query(`INSERT INTO business_profiles(id,name,owner_user_id,visibility,moderation_status,trust_status,status,category_code,city_code,country_code) VALUES('media_business','نشاط صور','media_owner','private','pending','pending','active',$1,'damascus','SY')`,[category.code]);
    await db.query(`INSERT INTO product_listings(id,business_profile_id,owner_user_id,title_ar,price,currency,category_code,availability,status,moderation_status) VALUES('media_product','media_business','media_owner','منتج صور',100,'SYP',$1,'in_stock','draft','pending')`,[category.code]);
    let actor='media_owner';
    process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS=JSON.stringify({'reviewer@example.test':['security_operations_engineer']});
    const service=new MediaService(db,{getCurrentUser:async()=>({id:actor,email:`${actor}@example.test`})} as any,new OperationsRbacService());
    Object.defineProperty(service,'storage',{value:new LocalStorageAdapter()});
    const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    const items:[MediaOwnerType,string,string][]=[['business_profile','media_business','gallery'],['professional_profile','professional_profile_mediafixture001','profile_image'],['product_listing','media_product','product_image']];
    for(const [ownerType,ownerId,assetType] of items){
      actor='media_owner';const asset=await service.upload(undefined,{ownerType,ownerId,assetType,visibility:'public',filename:'fixture.png',mimeType:'image/png',sizeBytes:png.length,content:png.toString('base64')});
      await t.test(`${ownerType}: unpublished bytes are restricted to the owner and authorized reviewer`,async()=>{
        await assert.rejects(()=>service.readPublic(asset.id),NotFoundException);
        actor='media_owner';assert.deepEqual((await service.readPublic(asset.id,'khedmah_session=owner')).data,png);
        actor='reviewer';assert.deepEqual((await service.readPublic(asset.id,'khedmah_session=reviewer')).data,png);
        actor='other';await assert.rejects(()=>service.readPublic(asset.id,'khedmah_session=other'),NotFoundException);
        await assert.rejects(()=>service.listForOwner('khedmah_session=other',ownerType,ownerId),ForbiddenException);
      });
      await t.test(`${ownerType}: publication enables anonymous reads and revocation removes access`,async()=>{
        await db.query(`UPDATE business_profiles SET visibility='public',moderation_status='approved',trust_status='approved',status='active' WHERE id='media_business'`);
        if(ownerType==='professional_profile')await db.query(`UPDATE professional_profiles SET visibility='public',moderation_status='approved',lifecycle_status='active' WHERE professional_profile_identifier=$1`,[ownerId]);
        if(ownerType==='product_listing')await db.query(`UPDATE product_listings SET status='active',moderation_status='approved' WHERE id=$1`,[ownerId]);
        assert.deepEqual((await service.readPublic(asset.id)).data,png);
        if(ownerType==='professional_profile')await db.query(`UPDATE professional_profiles SET lifecycle_status='suspended' WHERE professional_profile_identifier=$1`,[ownerId]);
        else await db.query(`UPDATE business_profiles SET trust_status='suspended' WHERE id='media_business'`);
        await assert.rejects(()=>service.readPublic(asset.id),NotFoundException);
      });
    }
    await t.test('private user media stays private even for a profile reviewer',async()=>{
      actor='media_owner';const asset=await service.upload(undefined,{ownerType:'user',ownerId:actor,assetType:'profile_image',visibility:'private',filename:'private.png',mimeType:'image/png',sizeBytes:png.length,content:png.toString('base64')});
      await assert.rejects(()=>service.readPublic(asset.id),NotFoundException);assert.deepEqual((await service.readPublic(asset.id,'khedmah_session=owner')).data,png);
      actor='reviewer';await assert.rejects(()=>service.readPublic(asset.id,'khedmah_session=reviewer'),NotFoundException);
    });
    const businesses=new BusinessProfileRepository(db),professionals=new ProfessionalProfileRepository(db);
    const upload=(ownerType:MediaOwnerType,ownerId:string,assetType:string)=>service.upload(undefined,{ownerType,ownerId,assetType,visibility:'public',filename:'review.png',mimeType:'image/png',sizeBytes:png.length,content:png.toString('base64')});
    for(const kind of ['business','professional'] as const){
      const ownerType=kind==='business'?'business_profile':'professional_profile';
      const id=kind==='business'?'media_business':'professional_profile_mediafixture001';
      const table=kind==='business'?'business_profiles':'professional_profiles';
      const key=kind==='business'?'id':'professional_profile_identifier';
      const repo=kind==='business'?businesses:professionals;
      async function approve(){actor='media_owner';await db.query(`UPDATE ${table} SET moderation_status='approved',visibility='public',${kind==='business'?"trust_status='approved',status='active'":"lifecycle_status='active'"} WHERE ${key}=$1`,[id]);return (await repo.findById(id))!;}
      await t.test(`${kind}: image upload invalidates approval and the queue includes the matching image revision`,async()=>{
        const before=await approve();const image=await upload(ownerType,id,kind==='business'?'gallery':'profile_image');
        const current=(await repo.findById(id))!;assert.notEqual(current.revision,before.revision);
        const pending=(await repo.listPendingModeration()).find(row=>row.id===id)!;assert.ok(pending);assert.equal(pending.revision,current.revision);assert.ok(pending.reviewImageUrls?.includes(image.publicUrl!));
        await assert.rejects(()=>repo.review(id,'media_owner','approved',before.revision),ConflictException);
        await assert.rejects(()=>service.readPublic(image.id),NotFoundException);
      });
      await t.test(`${kind}: image deletion revokes approval and removes the old media id`,async()=>{
        const image=await upload(ownerType,id,kind==='business'?'gallery':'profile_image');const before=await approve();
        await service.delete(undefined,image.id);const current=(await repo.findById(id))!;assert.notEqual(current.revision,before.revision);
        assert.ok((await repo.listPendingModeration()).some(row=>row.id===id));await assert.rejects(()=>service.readPublic(image.id,'khedmah_session=owner'),NotFoundException);
      });
      await t.test(`${kind}: image edits preserve administrative suspension`,async()=>{
        await db.query(`UPDATE ${table} SET moderation_status='suspended' WHERE ${key}=$1`,[id]);actor='media_owner';await upload(ownerType,id,kind==='business'?'gallery':'profile_image');
        const [row]=await db.query<{moderation_status:string}>(`SELECT moderation_status FROM ${table} WHERE ${key}=$1`,[id]);assert.equal(row.moderation_status,'suspended');
      });
    }
    await t.test('concurrent gallery uploads serialize the last available slot',async()=>{
      actor='media_owner';await db.query(`DELETE FROM media_assets WHERE owner_type='business_profile' AND owner_id='media_business' AND asset_type='gallery'`);
      for(let i=0;i<11;i++)await upload('business_profile','media_business','gallery');
      const outcomes=await Promise.allSettled([upload('business_profile','media_business','gallery'),upload('business_profile','media_business','gallery')]);
      assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(outcomes.filter(o=>o.status==='rejected'&&o.reason instanceof BadRequestException).length,1);
      const [count]=await db.query<{count:number}>(`SELECT count(*)::int AS count FROM media_assets WHERE owner_type='business_profile' AND owner_id='media_business' AND asset_type='gallery'`);assert.equal(count.count,12);
    });
    await t.test('logo replacement survives unavailable retired-object cleanup',async()=>{
      actor='media_owner';const old=await upload('business_profile','media_business','logo');
      const storage=(service as any).storage;const originalDelete=storage.delete;storage.delete=async()=>{throw new Error('storage unavailable');};
      try{const next=await upload('business_profile','media_business','logo');assert.notEqual(next.id,old.id);const logos=(await service.listForOwner(undefined,'business_profile','media_business')).filter(x=>x.assetType==='logo');assert.equal(logos.length,1);assert.equal(logos[0].id,next.id);await assert.rejects(()=>service.readPublic(old.id,'khedmah_session=owner'),NotFoundException);}finally{storage.delete=originalDelete;}
    });
    await t.test('legacy business image deletion locks ownership and invalidates the review revision',async()=>{
      actor='media_owner';const image=await upload('business_profile','media_business','cover');const before=(await businesses.findById('media_business'))!;
      await assert.rejects(()=>businesses.deleteMediaAsset('media_business',image.id,'other'),ForbiddenException);
      await businesses.deleteMediaAsset('media_business',image.id,'media_owner');assert.notEqual((await businesses.findById('media_business'))!.revision,before.revision);
      await assert.rejects(()=>service.readPublic(image.id,'khedmah_session=owner'),NotFoundException);
    });
  }finally{if(previous===undefined)delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;else process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS=previous;await pool.end();}
});
