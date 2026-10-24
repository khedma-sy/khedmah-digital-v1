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


test('order creation never persists coerced null, booleans, strings or arrays as delivery coordinates', () => {
  const valid = { ...payload, deliveryLatitude: 33.5, deliveryLongitude: 36.3 };
  assert.equal(validateCreateOrder(valid).deliveryLatitude, 33.5);
  assert.equal(validateCreateOrder(payload).deliveryLatitude, undefined);
  for (const field of ['deliveryLatitude', 'deliveryLongitude']) {
    for (const invalid of [null, false, true, '', '0', '33.5', [], [33.5], {}, undefined, Infinity]) {
      assert.throws(
        () => validateCreateOrder({ ...valid, [field]: invalid }),
        /delivery coordinates are invalid/,
        `Expected order creation to reject ${field}=${String(invalid)}`,
      );
    }
  }
});

test('restaurant delivery quote rejects invalid pricing before any billable route request', async () => {
  const originalPricing = process.env.RESTAURANT_DELIVERY_PRICING_JSON;
  const originalKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const originalFetch = globalThis.fetch;
  let routeRequests = 0;
  try {
    process.env.RESTAURANT_DELIVERY_PRICING_JSON = JSON.stringify({
      SYP: { baseFeeMinor: null, perKmMinor: 200, minimumFeeMinor: 300, maximumFeeMinor: 5000, pickupBufferMinutes: 10 },
    });
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-server-key';
    globalThis.fetch = (async () => {
      routeRequests += 1;
      throw new Error('Unexpected billable route request');
    }) as typeof fetch;

    const repo = { findProducts: async () => [{
      id: 'p1', business_profile_id: 'restaurant1', currency: 'SYP',
      business_category_code: 'restaurant', business_name: 'مطعم', title_ar: 'وجبة',
      status: 'active', moderation_status: 'approved', availability: 'in_stock',
      controlled_item: false, requires_prescription: false, price: 100,
    }] };
    const business = { id: 'restaurant1', visibility: 'public', moderationStatus: 'approved',
      trustStatus: 'approved', status: 'active', lat: 33.5, lng: 36.2 };
    const service = new OrderService(
      repo as never,
      { findById: async () => business } as never,
      { getCurrentUser: async () => ({ id: 'customer1' }) } as never,
    );
    await assert.rejects(
      service.deliveryQuote('fixture', {
        items: [{ productListingId: 'p1', quantity: 1 }],
        deliveryLatitude: 33.51, deliveryLongitude: 36.21,
      }),
      /Restaurant delivery pricing is temporarily unavailable/,
    );
    assert.equal(routeRequests, 0, 'Invalid pricing must never trigger Google Routes billing');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPricing === undefined) delete process.env.RESTAURANT_DELIVERY_PRICING_JSON;
    else process.env.RESTAURANT_DELIVERY_PRICING_JSON = originalPricing;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    else process.env.GOOGLE_MAPS_SERVER_API_KEY = originalKey;
  }
});
