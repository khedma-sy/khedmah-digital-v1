import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderService } from './order.service';
import type { FulfillmentOrder } from './order.types';

const delivered:FulfillmentOrder={id:'order-1',customerUserId:'customer-1',merchantBusinessId:'merchant-1',merchantOwnerUserId:'merchant-owner',merchantName:'مطعم',courierBusinessId:'courier-1',courierOwnerUserId:'courier-owner',courierName:'مندوب',vertical:'food',status:'delivered',paymentMethod:'cash',paymentStatus:'cash_collected',currency:'SYP',subtotal:1000,discountAmount:0,deliveryFee:200,total:1200,deliveryAddress:'دمشق المزة',customerPhone:'0999999999',prescriptionAttested:false,pharmacyReviewStatus:'not_required',items:[{productListingId:'p1',titleAr:'وجبة',unitPrice:1000,quantity:1,requiresPrescription:false}],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
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
test('quote canonicalizes two-decimal basket arithmetic before promotion comparison',async()=>{
  let quotedSubtotal=0;
  const product=(id:string,price:string)=>({id,business_profile_id:'merchant-1',owner_user_id:'merchant-owner',business_name:'مطعم',business_category_code:'restaurant',title_ar:id,price,currency:'USD',availability:'in_stock',status:'active',moderation_status:'approved',requires_prescription:false,controlled_item:false});
  const repo={findProducts:async()=>[product('p1','0.10'),product('p2','0.20')],quoteFoodPromotion:async(input:{subtotal:number})=>{quotedSubtotal=input.subtotal;return{merchantBusinessId:'merchant-1',vertical:'food',currency:'USD',subtotal:input.subtotal,discountAmount:0,discountedSubtotal:input.subtotal};}};
  const instance=new OrderService(repo as never,{} as never,{getCurrentUser:async()=>({id:'customer-1'})} as never);
  await instance.quote('cookie',{items:[{productListingId:'p1',quantity:1},{productListingId:'p2',quantity:1}]});
  assert.equal(quotedSubtotal,0.3);
});

test('merchant can recall only the courier assignment it reviewed',async()=>{
  const assigned:FulfillmentOrder={...delivered,status:'courier_assigned',paymentStatus:'pending'};
  let options:Record<string,unknown>|undefined;
  const repo={
    findById:async()=>assigned,
    transition:async(_order:FulfillmentOrder,_next:string,_actor:string,value:Record<string,unknown>)=>{options=value;return {...assigned,status:'merchant_confirmed',courierBusinessId:undefined,courierOwnerUserId:undefined,courierName:undefined,courierPhone:undefined};},
  };
  const instance=new OrderService(repo as never,{findById:async()=>undefined} as never,{getCurrentUser:async()=>({id:'merchant-owner'})} as never);
  await instance.transition('cookie','order-1',{status:'merchant_confirmed',reason:'لم يستجب المندوب',expectedCourierBusinessId:'courier-1'});
  assert.deepEqual(options,{authority:'merchant',reason:'لم يستجب المندوب',clearCourierBusinessId:true,expectedCourierBusinessId:'courier-1'});
  await assert.rejects(()=>instance.transition('cookie','order-1',{status:'merchant_confirmed',reason:'تغيير',expectedCourierBusinessId:'different'}),/Assigned courier changed/);
});

test('merchant receives assigned courier contact while customer waits for acceptance',async()=>{
  const assigned:FulfillmentOrder={...delivered,status:'courier_assigned',paymentStatus:'pending',courierPhone:'0999111222'};
  const repo={listForMerchant:async()=>[assigned],listForCustomer:async()=>[assigned]};
  const businesses={findById:async()=>({id:'merchant-1',ownerUserId:'merchant-owner'})};
  const merchant=new OrderService(repo as never,businesses as never,{getCurrentUser:async()=>({id:'merchant-owner'})} as never);
  const customer=new OrderService(repo as never,businesses as never,{getCurrentUser:async()=>({id:'customer-1'})} as never);
  const merchantOrder=(await merchant.merchant('cookie','merchant-1'))[0];
  const customerOrder=(await customer.mine('cookie'))[0];
  assert.equal(merchantOrder?.courierBusinessId,'courier-1');
  assert.equal(merchantOrder?.courierName,'مندوب');
  assert.equal(merchantOrder?.courierPhone,'0999111222');
  assert.equal(customerOrder?.courierBusinessId,undefined);
  assert.equal(customerOrder?.courierName,undefined);
  assert.equal(customerOrder?.courierPhone,undefined);
});

test('idempotency rejects a changed promotion quote for both prior and concurrent winners',async()=>{
  const winner:FulfillmentOrder={...delivered,id:'promo-winner',status:'placed',paymentStatus:'pending',promoCode:'FOOD20',subtotal:1000,discountAmount:200,deliveryFee:undefined,total:undefined};
  const payload={items:[{productListingId:'p1',quantity:1}],deliveryAddress:'دمشق المزة',customerPhone:'0999999999',prescriptionAttested:false,promoCode:'FOOD20',expectedSubtotal:1000,expectedDiscountAmount:100};
  const prior=new OrderService({findIdempotent:async()=>winner} as never,{} as never,{getCurrentUser:async()=>({id:'customer-1'})} as never);
  await assert.rejects(()=>prior.create('cookie',payload,'promo-prior-key-1234'),/different order/);

  let lookups=0;
  const concurrent=new OrderService({
    findIdempotent:async()=>++lookups===1?undefined:winner,
    findProducts:async()=>[{id:'p1',business_profile_id:'merchant-1',owner_user_id:'merchant-owner',business_name:'مطعم',business_category_code:'restaurant',title_ar:'وجبة',price:'1000',currency:'SYP',availability:'in_stock',status:'active',moderation_status:'approved',requires_prescription:false,controlled_item:false}],
    create:async()=>{throw Object.assign(new Error('duplicate'),{code:'23505'});},
  } as never,{} as never,{getCurrentUser:async()=>({id:'customer-1'})} as never);
  await assert.rejects(()=>concurrent.create('cookie',payload,'promo-race-key-1234'),/different order/);
});

test('accepted courier may finish pickup while unavailable for new jobs',async()=>{
  const ready:FulfillmentOrder={...delivered,status:'ready_for_pickup',paymentStatus:'pending'};
  let options:Record<string,unknown>|undefined;
  const repo={
    findById:async()=>ready,
    countApprovedMobilityDocuments:async()=>4,
    transition:async(_order:FulfillmentOrder,_next:string,_actor:string,value:Record<string,unknown>)=>{options=value;return{...ready,status:'picked_up'};},
  };
  const businesses={findById:async(id:string)=>id==='courier-1'
    ? {id,categoryCode:'delivery_courier',cityCode:'damascus',visibility:'public',trustStatus:'approved',moderationStatus:'approved',status:'active',availability:'busy'}
    : {id,cityCode:'damascus'}};
  const instance=new OrderService(repo as never,businesses as never,{getCurrentUser:async()=>({id:'courier-owner'})} as never);
  await instance.transition('cookie','order-1',{status:'picked_up'});
  assert.equal(options?.authority,'courier');
  assert.equal(options?.eligibleCourierBusinessId,'courier-1');
  assert.equal(options?.requireCourierAvailability,false);
});

test('overlapping account roles select the authority that owns the requested transition',async()=>{
  const sharedCustomerMerchant:FulfillmentOrder={...delivered,status:'placed',paymentStatus:'pending',customerUserId:'shared-owner',merchantOwnerUserId:'shared-owner'};
  let merchantOptions:Record<string,unknown>|undefined;
  const merchantService=new OrderService({
    findById:async()=>sharedCustomerMerchant,
    transition:async(_order:FulfillmentOrder,_next:string,_actor:string,value:Record<string,unknown>)=>{merchantOptions=value;return{...sharedCustomerMerchant,status:'quoted'};},
  } as never,{} as never,{getCurrentUser:async()=>({id:'shared-owner'})} as never);
  await merchantService.transition('cookie','order-1',{status:'quoted',deliveryFee:100});
  assert.equal(merchantOptions?.authority,'merchant');

  const sharedMerchantCourier:FulfillmentOrder={...delivered,status:'courier_assigned',paymentStatus:'pending',merchantOwnerUserId:'shared-operator',courierOwnerUserId:'shared-operator'};
  let courierOptions:Record<string,unknown>|undefined;
  const courierService=new OrderService({
    findById:async()=>sharedMerchantCourier,
    countApprovedMobilityDocuments:async()=>4,
    transition:async(_order:FulfillmentOrder,_next:string,_actor:string,value:Record<string,unknown>)=>{courierOptions=value;return{...sharedMerchantCourier,status:'courier_accepted'};},
  } as never,{findById:async(id:string)=>id==='courier-1'
    ? {id,categoryCode:'delivery_courier',cityCode:'damascus',visibility:'public',trustStatus:'approved',moderationStatus:'approved',status:'active',availability:'available'}
    : {id,cityCode:'damascus'}} as never,{getCurrentUser:async()=>({id:'shared-operator'})} as never);
  await courierService.transition('cookie','order-1',{status:'courier_accepted'});
  assert.equal(courierOptions?.authority,'courier');
});
