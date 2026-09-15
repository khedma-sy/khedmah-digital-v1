import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderService } from './order.service';
import type { FulfillmentOrder } from './order.types';

const delivered:FulfillmentOrder={id:'order-1',customerUserId:'customer-1',merchantBusinessId:'merchant-1',merchantOwnerUserId:'merchant-owner',merchantName:'مطعم',courierBusinessId:'courier-1',courierOwnerUserId:'courier-owner',courierName:'مندوب',vertical:'food',status:'delivered',paymentMethod:'cash',paymentStatus:'cash_collected',currency:'SYP',subtotal:1000,deliveryFee:200,total:1200,deliveryAddress:'دمشق المزة',customerPhone:'0999999999',prescriptionAttested:false,pharmacyReviewStatus:'not_required',items:[{productListingId:'p1',titleAr:'وجبة',unitPrice:1000,quantity:1,requiresPrescription:false}],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
function service(actor='customer-1',order:FulfillmentOrder=delivered){const authorized=[order.customerUserId,order.merchantOwnerUserId,order.courierOwnerUserId].includes(actor);const repo={findIdempotent:async()=>undefined,findProducts:async()=>[],findById:async()=>order,rate:async()=>undefined,trackingForActor:async()=>({status:order.status,authorized,location:["courier_accepted","ready_for_pickup","picked_up"].includes(order.status)?{latitude:33.5,longitude:36.3,recordedAt:new Date().toISOString()}:undefined}),recordLocation:async()=>true,transition:async()=>order};const businesses={findById:async()=>undefined};const identity={getCurrentUser:async()=>({id:actor,email:'user@example.com'})};return{repo,instance:new OrderService(repo as never,businesses as never,identity as never)}}
test('only delivered order customer can rate merchant and courier',async()=>{const owner=service();await owner.instance.rate('cookie','order-1',{targetType:'merchant',score:5,comment:'ممتاز'});await assert.rejects(()=>service('other-user').instance.rate('cookie','order-1',{targetType:'merchant',score:5}),/Only the order customer/);await assert.rejects(()=>service('customer-1',{...delivered,status:'picked_up'}).instance.rate('cookie','order-1',{targetType:'courier',score:5}),/only after delivery/);});
test('location updates are courier-only and active-lifecycle-only',async()=>{const active={...delivered,status:'picked_up' as const,paymentStatus:'pending' as const};await service('courier-owner',active).instance.location('cookie','order-1',{latitude:33.5,longitude:36.3,accuracy:12});await assert.rejects(()=>service('customer-1',active).instance.location('cookie','order-1',{latitude:33.5,longitude:36.3}),/Only the assigned courier/);await assert.rejects(()=>service('courier-owner',delivered).instance.location('cookie','order-1',{latitude:33.5,longitude:36.3}),/not active/);});
test('tracking is private and never returns a courier location after closure',async()=>{for(const actor of ['customer-1','merchant-owner','courier-owner']){const result=await service(actor).instance.tracking('cookie','order-1');assert.equal(result.status,'delivered');assert.equal(result.location,undefined)}const active={...delivered,status:'picked_up' as const,paymentStatus:'pending' as const};assert.equal((await service('customer-1',active).instance.tracking('cookie','order-1')).location?.latitude,33.5);await assert.rejects(()=>service('stranger').instance.tracking('cookie','order-1'),/Access denied/);});
test('concurrent create recovers the committed idempotency winner without duplicating an order',async()=>{
  const winner:FulfillmentOrder={...delivered,id:'winner-order',status:'placed',paymentStatus:'pending',deliveryFee:undefined,total:undefined,deliveryLatitude:33.5,deliveryLongitude:36.3,customerNote:'اتصل عند الوصول'};
  let lookups=0;
  const repo={
    findIdempotent:async()=>++lookups===1?undefined:winner,
    findProducts:async()=>[{id:'p1',business_profile_id:'merchant-1',owner_user_id:'merchant-owner',business_name:'مطعم',business_category_code:'restaurant',title_ar:'وجبة',price:'1000',currency:'SYP',availability:'in_stock',status:'active',moderation_status:'approved',requires_prescription:false,controlled_item:false}],
    create:async()=>{throw Object.assign(new Error('duplicate'),{code:'23505'});},
  };
  const instance=new OrderService(repo as never,{findById:async()=>undefined} as never,{getCurrentUser:async()=>({id:'customer-1'})} as never);
  const result=await instance.create('cookie',{items:[{productListingId:'p1',quantity:1}],deliveryAddress:'دمشق المزة',customerPhone:'0999999999',deliveryLatitude:33.5,deliveryLongitude:36.3,customerNote:'اتصل عند الوصول'},'same-request-key-123');
  assert.equal(result.id,'winner-order');assert.equal(lookups,2);
});
test('idempotency comparison includes delivery coordinates',async()=>{
  const prior:FulfillmentOrder={...delivered,status:'placed',paymentStatus:'pending',deliveryLatitude:33.5,deliveryLongitude:36.3};
  const repo={findIdempotent:async()=>prior};
  const instance=new OrderService(repo as never,{findById:async()=>undefined} as never,{getCurrentUser:async()=>({id:'customer-1'})} as never);
  await assert.rejects(()=>instance.create('cookie',{items:[{productListingId:'p1',quantity:1}],deliveryAddress:'دمشق المزة',customerPhone:'0999999999',deliveryLatitude:33.6,deliveryLongitude:36.3},'coordinate-key-1234'),/different order/);
});
