import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { DatabasePool } from '../database/database.pool';
import { IdentityRepository } from '../identity/identity.repository';
import { OrderRepository } from './order.repository';
import { DriverDocumentReviewService } from '../media/driver-document-review.service';

test('courier selection paginates real eligible profiles and excludes a newer pending document', {timeout:30_000}, async()=>{
  const pool=createTestPool(),db=DatabasePool.fromPool(pool),repo=new OrderRepository(db),identity=new IdentityRepository(db);
  const owner=randomUUID(),reviewer=randomUUID(),profiles:string[]=[];
  try{
    await resetCanonicalTestSchema(pool);
    for(const migration of ['024_product_store','025_classifieds','026_cash_fulfillment_orders','027_mobility_document_reviews'])await pool.query(await readFile(resolve(__dirname,'../../../../backend/migrations/versions',`${migration}.sql`),'utf8'));
    const now=new Date().toISOString();
    for(const id of [owner,reviewer])await identity.saveAccount({id,email:`${id}@example.test`,passwordHash:'nonlogin-fixture',status:'active',createdAt:now,updatedAt:now});
    for(let i=0;i<22;i++){
      const id=randomUUID();profiles.push(id);
      await pool.query(`INSERT INTO business_profiles(id,name,owner_user_id,category_code,city_code,visibility,moderation_status,trust_status,status) VALUES($1,$2,$3,'delivery_courier','damascus','public','approved','approved','active')`,[id,`Courier ${String(i).padStart(2,'0')}`,owner]);
      for(const kind of ['driver_photo','identity_card','driving_license','vehicle_license']){
        const media=randomUUID();
        await pool.query(`INSERT INTO media_assets(id,owner_user_id,owner_type,owner_id,filename,mime_type,size_bytes,visibility,storage_key,asset_type) VALUES($1,$2,'business_profile',$3,'fixture.png','image/png',1,'private',$1,$4)`,[media,owner,id,kind]);
        await pool.query(`UPDATE mobility_document_reviews SET status='approved',reviewed_by=$2,reviewed_at=NOW() WHERE media_asset_id=$1`,[media,reviewer]);
      }
    }
    const first=await repo.eligibleCouriers('damascus',1),second=await repo.eligibleCouriers('damascus',2);
    assert.equal(first.total,22);assert.equal(first.couriers.length,20);assert.equal(second.couriers.length,2);
    assert.equal(new Set([...first.couriers,...second.couriers].map(c=>c.id)).size,22);
    assert.equal((await repo.eligibleCouriers('aleppo',1)).total,0);
    const media=randomUUID();
    await pool.query(`INSERT INTO media_assets(id,owner_user_id,owner_type,owner_id,filename,mime_type,size_bytes,visibility,storage_key,asset_type) VALUES($1,$2,'business_profile',$3,'renewal.png','image/png',1,'private',$1,'driving_license')`,[media,owner,profiles[0]]);
    await pool.query(`UPDATE mobility_document_reviews SET created_at=NOW()+INTERVAL '1 second' WHERE media_asset_id=$1`,[media]);
    const refreshed=await repo.eligibleCouriers('damascus',1);
    assert.equal(refreshed.total,21);assert.ok(refreshed.couriers.every(c=>c.id!==profiles[0]));
    const reviews=new DriverDocumentReviewService(db,{getCurrentUser:async()=>({id:reviewer,email:'reviewer@example.test'})} as never,{assert(){}} as never);
    const queue=await reviews.reviewQueue('fixture');
    assert.equal(queue.businesses.length,1);assert.equal(queue.businesses[0].businessProfileId,profiles[0]);assert.equal(queue.businesses[0].pendingDocuments,1);
    const missingReviewMedia=randomUUID();
    await pool.query(`INSERT INTO media_assets(id,owner_user_id,owner_type,owner_id,filename,mime_type,size_bytes,visibility,storage_key,asset_type)
      VALUES($1,$2,'business_profile',$3,'renewal-missing-review.png','image/png',1,'private',$1,'identity_card')`,[missingReviewMedia,owner,profiles[4]]);
    await pool.query(`DELETE FROM mobility_document_reviews WHERE media_asset_id=$1`,[missingReviewMedia]);
    const queueWithMissingDecision=await reviews.reviewQueue('fixture');
    const missingDecisionBusiness=queueWithMissingDecision.businesses.find(item=>item.businessProfileId===profiles[4]);
    assert.ok(missingDecisionBusiness,'latest private mobility asset without a decision row must remain in the admin review queue');
    assert.equal(missingDecisionBusiness.pendingDocuments,1);
    await pool.query("UPDATE business_profiles SET trust_status='pending' WHERE id=$1",[profiles[1]]);
    assert.equal((await repo.eligibleCouriers('damascus',1)).total,20);
    await pool.query("UPDATE business_profiles SET availability='busy' WHERE id=$1",[profiles[2]]);
    assert.equal((await repo.eligibleCouriers('damascus',1)).total,19);
    await pool.query("UPDATE business_profiles SET availability='available' WHERE id=$1",[profiles[2]]);
    const merchantId=randomUUID();
    await pool.query(`INSERT INTO business_profiles(id,name,owner_user_id,category_code,city_code,visibility,moderation_status,trust_status,status) VALUES($1,'Restaurant',$2,'restaurant','damascus','public','approved','approved','active')`,[merchantId,owner]);
    await pool.query(`INSERT INTO fulfillment_orders(id,customer_user_id,merchant_business_id,courier_business_id,vertical,status,payment_method,payment_status,currency,subtotal,delivery_address,customer_phone,idempotency_key) VALUES($1,$2,$3,$4,'food','courier_assigned','cash','pending','SYP',1000,'Damascus address','0999999999',$5)`,[randomUUID(),owner,merchantId,profiles[3],`active-job-${randomUUID()}`]);
    const withoutBusyCouriers=await repo.eligibleCouriers('damascus',1);
    assert.equal(withoutBusyCouriers.total,19);
    assert.ok(withoutBusyCouriers.couriers.every(c=>c.id!==profiles[3]));
  }finally{await pool.end();}
});
