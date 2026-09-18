import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';

const product = { id: 'dish-one', businessProfileId: 'restaurant-one', businessName: 'مطعم أول', titleAr: 'وجبة', price: 100, currency: 'SYP', availability: 'available', requiresPrescription: false };
const recoveryKey = 'khedmah:checkout-attempt:v1:restaurant-one:';
const promotionQuote = (discountAmount = 20) => ({
  merchantBusinessId: 'restaurant-one', vertical: 'food', currency: 'SYP', subtotal: 200,
  discountAmount, discountedSubtotal: 200 - discountAmount,
  promotion: { code: 'SAVE20', nameAr: 'خصم الاختبار' },
});
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}
function deniedStorage() {
  return Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(name => [name, () => { throw new Error(`Storage denied: ${name}`); }]));
}
function fixture({ clearFails = false, notificationsFail = false, storage = memoryStorage(), cartQuantity = 2 } = {}) {
  let params = new URLSearchParams('businessId=restaurant-one'), sequence = 0;
  const creates = [], quotes = [], loads = [], navigations = [], cleared = [];
  const api = {
    products: {
      list: filters => { const call = { ...deferred(), filters }; loads.push(call); return call.promise; },
      get: id => { const call = { ...deferred(), id }; loads.push(call); return call.promise; },
    },
    orders: {
      quote: data => { const call = { ...deferred(), data }; quotes.push(call); return call.promise; },
      create: (data, key) => { const call = { ...deferred(), data, key }; creates.push(call); return call.promise; },
    },
  };
  const page = clientPage(readSource('apps/frontend/app/orders/checkout/page.tsx'), {
    'next/navigation': { useRouter: () => ({ push: url => navigations.push(url) }), useSearchParams: () => params },
    '../../../lib/recovered-service-client': { api },
    '../../../lib/restaurant-cart': { readRestaurantCart: () => ({ items: [{ productId: product.id, quantity: cartQuantity }] }), clearRestaurantCart: id => { cleared.push(id); if (clearFails) throw new Error('Storage denied'); } },
    '../../components/delivery-help': { DeliveryHelp: 'DeliveryHelp' },
    '../../components/ui-primitives': primitives,
    '../order-alerts': { requestOrderNotifications: async () => { if (notificationsFail) throw new Error('Permission API unavailable'); } },
    './checkout.module.css': { default: css },
  }, { crypto: { randomUUID: () => `request-${++sequence}` }, sessionStorage: storage });
  async function ready() {
    loads[0].resolve({ products: [product] });
    await page.flush();
    const phone = page.find(node => node.props?.name === 'phone');
    if (phone && !phone.props.disabled) {
      page.edit('phone', '0999999999');
      page.edit('address', 'عنوان تسليم تجريبي');
    }
  }
  function navigate(query) { params = new URLSearchParams(query); page.render(); }
  return { page, creates, quotes, loads, navigations, cleared, ready, navigate, storage };
}

test('checkout suppresses same-tick double submit and replays a lost response with the same key and payload', async () => {
  const f = fixture(); await f.ready();
  const form = f.page.find(n => n.props?.as === 'form');
  void form.props.onSubmit({ preventDefault() {} });
  void form.props.onSubmit({ preventDefault() {} });
  assert.equal(f.creates.length, 1);
  const first = f.creates[0]; first.reject(new Error('Response lost after commit')); await f.page.flush();
  assert.ok(f.page.text.includes('إعادة المحاولة واستعادة الطلب'));
  assert.equal(f.page.find(n => n.props?.name === 'address').props.disabled, true);
  // Even a stale event cannot change the payload of an unresolved request.
  f.page.edit('address', 'عنوان آخر'); void f.page.submit();
  assert.equal(f.creates.length, 2);
  assert.equal(f.creates[1].key, first.key);
  assert.deepEqual(f.creates[1].data, first.data);
  f.creates[1].resolve({ order: { id: 'one-order' } }); await f.page.flush();
  assert.deepEqual(f.navigations, ['/orders']);
  void f.page.submit(); assert.equal(f.creates.length, 2);
});

test('checkout allows corrected input after a definitive rejection and starts a new request', async () => {
  const f = fixture(); await f.ready(); void f.page.submit();
  f.creates[0].reject(Object.assign(new Error('Invalid address'), { statusCode: 400 })); await f.page.flush();
  assert.equal(f.page.find(n => n.props?.name === 'address').props.disabled, false);
  f.page.edit('address', 'عنوان مصحح'); void f.page.submit();
  assert.notEqual(f.creates[1].key, f.creates[0].key);
  assert.equal(f.creates[1].data.deliveryAddress, 'عنوان مصحح');
  f.creates[1].resolve({ order: { id: 'corrected' } }); await f.page.flush();
});

test('notification rejection and cart-storage failure cannot turn a successful order into a retry', async () => {
  const f = fixture({ clearFails: true, notificationsFail: true }); await f.ready(); void f.page.submit();
  assert.equal(f.creates.length, 1);
  f.creates[0].resolve({ order: { id: 'saved-despite-storage' } }); await f.page.flush();
  assert.deepEqual(f.navigations, ['/orders']);
  assert.equal(f.page.text.includes('Storage denied'), false);
  void f.page.submit(); assert.equal(f.creates.length, 1);
});

test('an incomplete success response remains recoverable and does not clear the cart', async () => {
  const f = fixture(); await f.ready(); void f.page.submit();
  f.creates[0].resolve({}); await f.page.flush();
  assert.deepEqual(f.cleared, []); assert.deepEqual(f.navigations, []);
  void f.page.submit(); assert.equal(f.creates[1].key, f.creates[0].key);
  f.creates[1].resolve({ order: { id: 'recovered' } }); await f.page.flush();
});

test('promo re-quote blocks submission and an uncertain retry replays its exact accepted snapshot', async () => {
  const f = fixture(); await f.ready();
  f.page.edit('promoCode', 'save20');
  f.page.click('تطبيق الكود');
  f.quotes[0].resolve({ quote: promotionQuote(20) }); await f.page.flush();
  f.page.click('إعادة التحقق');
  assert.equal(f.page.text.includes('بعد الخصم'), false, 'the old quote is removed synchronously');
  void f.page.submit();
  assert.equal(f.creates.length, 0, 'a stale submit cannot race the quote request');
  f.quotes[1].resolve({ quote: promotionQuote(30) }); await f.page.flush();
  void f.page.submit();
  assert.equal(f.creates.length, 1);
  assert.equal(f.creates[0].data.promoCode, 'SAVE20');
  assert.equal(f.creates[0].data.expectedDiscountAmount, 30);
  const snapshot = JSON.stringify(f.creates[0].data);
  const key = f.creates[0].key;
  f.creates[0].reject(new Error('Response lost after commit')); await f.page.flush();
  void f.page.submit();
  assert.equal(f.creates[1].key, key);
  assert.equal(JSON.stringify(f.creates[1].data), snapshot);
  f.creates[1].resolve({ order: { id: 'promo-recovered' } }); await f.page.flush();
});

test('a promo quote completed after unmount performs no component writes', async () => {
  const f = fixture(); await f.ready();
  f.page.edit('promoCode', 'save20');
  f.page.click('تطبيق الكود');
  f.page.unmount();
  f.quotes[0].resolve({ quote: promotionQuote() }); await f.page.flush();
  assert.equal(f.page.writesAfterUnmount, 0);
  assert.deepEqual(f.navigations, []);
});

test('reload restores an unresolved request and reuses the same key and payload', async () => {
  const storage = memoryStorage();
  const firstPage = fixture({ storage }); await firstPage.ready();
  void firstPage.page.submit();
  const first = firstPage.creates[0];
  first.reject(new Error('Connection closed after send')); await firstPage.page.flush();
  assert.ok(storage.getItem(recoveryKey));
  firstPage.page.unmount();

  const restoredPage = fixture({ storage }); await restoredPage.ready();
  assert.ok(restoredPage.page.text.includes('استعادة النتيجة'));
  void restoredPage.page.submit();
  assert.equal(restoredPage.creates.length, 1);
  assert.equal(restoredPage.creates[0].key, first.key);
  assert.equal(JSON.stringify(restoredPage.creates[0].data), JSON.stringify(first.data));
  restoredPage.creates[0].resolve({ order: { id: 'restored-after-reload' } }); await restoredPage.page.flush();
  assert.equal(storage.getItem(recoveryKey), null);
  assert.deepEqual(restoredPage.navigations, ['/orders']);
});

test('a stored attempt with a different basket fails closed until the customer explicitly clears it', async () => {
  const stored = {
    version: 1,
    scope: 'restaurant-one:',
    request: {
      key: 'prior-request',
      expiresAt: Date.now() + 60_000,
      quote: null,
      data: {
        items: [{ productListingId: product.id, quantity: 1 }],
        deliveryAddress: 'عنوان سابق', customerPhone: '0999999999', prescriptionAttested: false,
      },
    },
  };
  const storage = memoryStorage({ [recoveryKey]: JSON.stringify(stored) });
  const f = fixture({ storage }); await f.ready();
  assert.ok(f.page.text.includes('لا تطابق السلة الحالية'));
  void f.page.submit();
  assert.equal(f.creates.length, 0);
  assert.ok(storage.getItem(recoveryKey), 'the mismatch is not discarded implicitly');
  f.page.click('راجعت طلباتي، بدء طلب جديد');
  assert.equal(storage.getItem(recoveryKey), null);
  assert.equal(f.page.find(node => node.props?.name === 'address').props.disabled, false);
});

test('session storage denial does not prevent in-page recovery', async () => {
  const f = fixture({ storage: deniedStorage() }); await f.ready();
  void f.page.submit();
  const first = f.creates[0];
  first.reject(new Error('Response uncertain')); await f.page.flush();
  void f.page.submit();
  assert.equal(f.creates[1].key, first.key);
  assert.deepEqual(f.creates[1].data, first.data);
  f.creates[1].resolve({ order: { id: 'storage-independent' } }); await f.page.flush();
  assert.deepEqual(f.navigations, ['/orders']);
  assert.equal(f.page.text.includes('Storage denied'), false);
});

test('checkout clears previous restaurant items while a new route loads or fails', async () => {
  const f = fixture(); await f.ready();
  const oldForm = f.page.find(n => n.props?.as === 'form');
  f.navigate('businessId=restaurant-two');
  assert.equal(f.page.text.includes('مطعم أول'), false);
  void oldForm.props.onSubmit({ preventDefault() {} }); assert.equal(f.creates.length, 0);
  f.loads[1].reject(new Error('Restaurant unavailable')); await f.page.flush();
  assert.equal(f.page.text.includes('مطعم أول'), false);
  assert.equal(f.page.find(n => n.props?.as === 'form'), undefined);
  assert.ok(f.page.text.includes('Restaurant unavailable'));
});

test('an old order response cannot redirect or write state into another checkout route', async () => {
  const f = fixture(); await f.ready(); void f.page.submit();
  f.navigate('businessId=restaurant-two');
  f.creates[0].resolve({ order: { id: 'old-route-order' } }); await f.page.flush();
  assert.deepEqual(f.navigations, []); assert.deepEqual(f.cleared, []);
  f.loads[1].reject(new Error('New restaurant unavailable')); await f.page.flush();
  assert.ok(f.page.text.includes('New restaurant unavailable'));
});

test('a completed request after unmount performs no navigation or component writes', async () => {
  const f = fixture(); await f.ready(); void f.page.submit(); f.page.unmount();
  f.creates[0].resolve({ order: { id: 'saved-offscreen' } }); await f.page.flush();
  assert.equal(f.page.writesAfterUnmount, 0); assert.deepEqual(f.navigations, []);
});

test('single-product checkout rejects an out-of-stock product before submission', async () => {
  const f = fixture(); f.navigate('productId=dish-one');
  f.loads[1].resolve({ product: { ...product, availability: 'out_of_stock' } }); await f.page.flush();
  f.loads[0].resolve({ products: [product] }); await f.page.flush();
  assert.ok(f.page.text.includes('غير متوفر'));
  assert.equal(f.page.find(n => n.props?.as === 'form'), undefined);
});
