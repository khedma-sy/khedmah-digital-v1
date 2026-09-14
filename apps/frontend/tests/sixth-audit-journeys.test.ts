import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [home, categories, map, search, taxi, taxiSignup, taxiAdmin, deliveryHelp, restaurant, merchant, courier, classifieds] = await Promise.all([
  read('app/page.tsx'),
  read('app/components/category-directory.tsx'),
  read('app/map/page.tsx'),
  read('app/search/page.tsx'),
  read('app/taxi/page.tsx'),
  read('app/taxi-driver-signup/page.tsx'),
  read('app/admin/taxi-drivers/page.tsx'),
  read('app/components/delivery-help.tsx'),
  read('app/restaurants/[businessId]/page.tsx'),
  read('app/orders/merchant/page.tsx'),
  read('app/orders/courier/page.tsx'),
  read('app/classifieds/[id]/page.tsx')
]);

test('sixth audit keeps launch hierarchy and canonical brand section colors', () => {
  const food = home.indexOf('href="/food"');
  const delivery = home.indexOf('href="/mobility?type=delivery"');
  const taxiIndex = home.indexOf('href="/taxi"');
  assert.ok(food >= 0 && delivery > food && taxiIndex > delivery, 'Food → Delivery → Taxi must remain the launch order');
  assert.match(home, /#07427c/);
  assert.match(home, /#81be49/);
  assert.match(home, /#fd9603/);
  assert.match(home, /فترة تجريبية/);
  assert.doesNotMatch(home, /سجّل الآن|مجاني/);
});

test('categories, Near Me and Discover remain URL-owned and fail closed on invalid metadata', () => {
  assert.match(categories, /useSearchParams/);
  assert.match(categories, /canonicalCategoryCode/);
  assert.match(categories, /canonicalCityCode/);
  assert.match(categories, /mapHref/);
  assert.match(categories, /requestId === sequence\.current/);
  assert.match(map, /useSearchParams/);
  assert.match(map, /navigator\.geolocation/);
  assert.match(map, /#81be49/);
  assert.match(map, /tileReady/);
  assert.match(search, /Draft fields never change the filters belonging to already displayed results/);
  assert.match(search, /requestId === sequence\.current/);
  assert.match(search, /invalidCategory/);
  assert.match(search, /invalidCity/);
});

test('Taxi rider and driver execution remain account-bound and browser cannot invent arrival or finish evidence', () => {
  assert.match(taxi, /taxiApi\.rider\.quote/);
  assert.match(taxi, /taxiApi\.rider\.place/);
  assert.match(taxi, /taxiApi\.rider\.consent/);
  assert.match(taxi, /taxiApi\.driver\.access/);
  assert.match(taxi, /taxiApi\.driver\.offers/);
  assert.match(taxi, /taxiApi\.driver\.authorization/);
  assert.match(taxi, /الوصول وإنهاء الرحلة يعتمدان على إثباتات تشغيلية موثوقة/);
  assert.doesNotMatch(taxi, /driver\.arrive|driver\.finish|command\([^\n]*['"]arrive|command\([^\n]*['"]finish/);
});

test('Taxi onboarding reports effective eligibility, not merely a stored approved flag', () => {
  assert.match(taxiSignup, /operationalExpiry/);
  assert.match(taxiSignup, /operationalExpired/);
  assert.match(taxiSignup, /operationalStatus === 'approved'[\s\S]*profileReady[\s\S]*operationalExpiry > Date\.now\(\)/);
  assert.match(taxiSignup, /انتهت صلاحية الاعتماد/);
  assert.match(taxiSignup, /الاعتماد المسجل متوقف الأثر/);
  assert.match(taxiSignup, /لا تفتح Trip engine/);
});

test('Taxi Ops counts only currently eligible approvals and exposes renewal blockers', () => {
  assert.match(taxiAdmin, /isOperationalEligible/);
  assert.match(taxiAdmin, /isOperationalExpired/);
  assert.match(taxiAdmin, /operational: candidates\.filter\(isOperationalEligible\)\.length/);
  assert.match(taxiAdmin, /جاهز للاعتماد\/التجديد/);
  assert.match(taxiAdmin, /انتهت صلاحية الاعتماد/);
  assert.match(taxiAdmin, /متوقف بسبب حالة الملف/);
  assert.match(taxiAdmin, /بعد أكثر من ساعة وبحد أقصى سنتين/);
});

test('delivery bridge preserves integrated restaurant fulfillment versus independent ad delivery', () => {
  assert.match(deliveryHelp, /هل تحتاج مندوب توصيل؟/);
  assert.match(deliveryHelp, /بعد اعتماد رسوم التوصيل وموافقتك على الإجمالي/);
  assert.match(deliveryHelp, /هذا لا ينشئ دفعة أو طلب شراء داخل الإعلانات/);
  assert.match(deliveryHelp, /\/mobility\?type=delivery/);
  assert.match(restaurant, /DeliveryHelp/);
  assert.match(classifieds, /DeliveryHelp mode="independent"/);
});

test('restaurant and courier operational decisions use in-app evidence dialogs, never native browser prompts', () => {
  assert.match(merchant, /orderDialog/);
  assert.match(merchant, /pharmacyApproved/);
  assert.match(merchant, /موافقة الزبون/);
  assert.doesNotMatch(merchant, /window\.(prompt|confirm)\s*\(/);
  assert.match(courier, /CourierEvidenceDialog/);
  assert.match(courier, /استلمت الطلب/);
  assert.match(courier, /تم التسليم وتحصيل النقد/);
  assert.doesNotMatch(courier, /window\.(prompt|confirm)\s*\(/);
});

test('Classifieds stays contact-first and cannot become a fake checkout surface', () => {
  assert.match(classifieds, /التواصل والاتفاق يتمان مباشرة مع المعلن/);
  assert.match(classifieds, /لا تعالج خدمة المدفوعات أو عمليات الشراء داخل الإعلانات/);
  assert.match(classifieds, /mayNeedDelivery = ad\.kind === 'sale' \|\| ad\.kind === 'rent'/);
  assert.doesNotMatch(classifieds, /checkout|paymentIntent|createPayment|buyNow/i);
});
