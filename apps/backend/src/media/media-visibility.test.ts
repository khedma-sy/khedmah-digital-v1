import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ForbiddenException,NotFoundException} from '@nestjs/common';
import {DatabasePool} from '../database/database.pool';
import {createTestPool,resetCanonicalTestSchema} from '../database/test-pool';
import {OperationsRbacService} from '../operations-product/operations-rbac.service';
import {MediaService} from './media.service';
import {LocalStorageAdapter} from './storage.adapter';
import type {MediaOwnerType} from './media.types';

test('media bytes and owner lists follow parent eligibility on PostgreSQL',async(t)=>{
  const pool=createTestPool();const db=DatabasePool.fromPool(pool);const previous=process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;
  try{
    await resetCanonicalTestSchema(pool);
    await db.query(await readFile(resolve(__dirname,'../../../../backend/migrations/versions/024_product_store.sql'),'utf8'));
    await db.query(`INSERT INTO core_user_accounts(user_identifier,identity_reference,account_type,account_status,lifecycle_status,visibility_classification) VALUES('media_owner','media_identity','individual_user','active','active','private')`);
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
  }finally{if(previous===undefined)delete process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS;else process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS=previous;await pool.end();}
});
