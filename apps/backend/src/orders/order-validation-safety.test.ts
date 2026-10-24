import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCreateOrder, validateOrderAction, validateRestaurantDeliveryQuote } from './order.validation';
import { OrderService } from './order.service';

const payload={items:[{productListingId:'p1',quantity:1}],deliveryAddress:'دمشق المزة',customerPhone:'0999999999'};
test('order creation rejects non-finite coordinates and malformed bodies before persistence',()=>{
  for(const coordinates of [{deliveryLatitude:'NaN',deliveryLongitude:36},{deliveryLatitude:33,deliveryLongitude:'bad'},{deliveryLatitude:Infinity,deliveryLongitude:36}])assert.throws(()=>validateCreateOrder({...payload,...coordinates}),/coordinates are invalid/);
  assert.equal(validateCreateOrder({...payload,deliveryLatitude:0,deliveryLongitude:0}).deliveryLatitude,0);
  assert.throws(()=>validateCreateOrder(null as never),/payload is invalid/);
  assert.throws(()=>validateOrderAction(null as never),/action is invalid/);
  assert.throws(()=>validateOrderAction({status:'quoted',deliveryFee:1.234}),/deliveryFee is invalid/);
  assert.equal(validateOrderAction({status:'quoted',deliveryFee:1.23}).deliveryFee,1.23);
});
test('eligible courier discovery is restricted to the merchant owner and the merchant city',async()=>{
  const calls:unknown[]=[];
  const repo={eligibleCouriers:async(...args:unknown[])=>{calls.push(args);return {couriers:[],total:0,page:1,limit:20};}};
  const business={id:'merchant',ownerUserId:'owner',categoryCode:'restaurant',cityCode:'damascus'};
  const make=(actor:string)=>new OrderService(repo as never,{findById:async()=>business} as never,{getCurrentUser:async()=>({id:actor})} as never);
  await assert.rejects(make('stranger').eligibleCouriers('fixture','merchant'),/Access denied/);assert.equal(calls.length,0);
  await make('owner').eligibleCouriers('fixture','merchant','2');assert.deepEqual(calls,[['damascus',2]]);
  await assert.rejects(make('owner').eligibleCouriers('fixture','merchant','-1'),/page is invalid/);
});


test('restaurant delivery quote requires actual numeric coordinates before the server-side route lookup', () => {
  const valid = { items: payload.items, deliveryLatitude: 33.5, deliveryLongitude: 36.3 };
  assert.deepEqual(validateRestaurantDeliveryQuote(valid), valid);
  assert.equal(validateRestaurantDeliveryQuote({ ...valid, deliveryLatitude: 0, deliveryLongitude: 0 }).deliveryLatitude, 0);
  for (const field of ['deliveryLatitude', 'deliveryLongitude']) {
    for (const invalid of [null, false, true, '', '0', '33.5', [], [33.5], {}, undefined, Infinity, -Infinity, NaN]) {
      assert.throws(
        () => validateRestaurantDeliveryQuote({ ...valid, [field]: invalid }),
        /delivery coordinates are invalid/,
        `Expected ${field}=${String(invalid)} to be rejected`,
      );
    }
  }
  assert.throws(() => validateRestaurantDeliveryQuote({ ...valid, deliveryLatitude: 91 }), /delivery coordinates are invalid/);
  assert.throws(() => validateRestaurantDeliveryQuote({ ...valid, deliveryLongitude: -181 }), /delivery coordinates are invalid/);
});
