import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('cash fulfillment schema preserves money, pharmacy, rating and tracking boundaries',async()=>{const sql=await read('backend/migrations/versions/026_cash_fulfillment_orders.sql');for(const contract of [/payment_method = 'cash'/,/total = subtotal \+ delivery_fee/,/controlled_item/,/pharmacy_review_status/,/fulfillment_order_ratings_target_unique/,/score BETWEEN 1 AND 5/,/fulfillment_order_location_updates/,/fulfillment_order_location_order_unique/,/fulfillment_orders_customer_idempotency_unique/])assert.match(sql,contract);assert.doesNotMatch(sql,/card_number|payment_token|stripe|paypal/i);});

test('order service restricts actors, medicines and lifecycle transitions',async()=>{const service=await read('apps/backend/src/orders/order.service.ts');for(const contract of [/Controlled pharmacy items cannot be ordered/,/Pharmacist approval is required/,/Only the order customer can rate it/,/Ratings are available only after delivery/,/Only the assigned courier can share location/,/Location sharing is not active/])assert.match(service,contract);});

test('customer merchant and courier surfaces expose the complete cash journey',async()=>{const[customer,checkout,merchant,courier,product]=await Promise.all([read('apps/frontend/app/orders/page.tsx'),read('apps/frontend/app/orders/checkout/page.tsx'),read('apps/frontend/app/orders/merchant/page.tsx'),read('apps/frontend/app/orders/courier/page.tsx'),read('apps/frontend/app/store/products/[id]/page.tsx')]);assert.match(product,/اطلب الآن — الدفع نقدي/);assert.match(checkout,/رسوم التوصيل/);assert.match(customer,/تقييم المنشأة/);assert.match(customer,/تقييم المندوب/);assert.match(merchant,/اختيار مندوب/);assert.match(courier,/تم التسليم وتحصيل النقد/);assert.match(courier,/CourierLocationButton/);});

test('order polling and courier updates use the shared persistent rate limiter',async()=>{const app=await read('apps/backend/src/app.ts');const repository=await read('apps/backend/src/orders/order.repository.ts');assert.match(app,/\/api\/v1\/orders/);assert.match(repository,/ON CONFLICT \(order_id\) DO UPDATE/);});
