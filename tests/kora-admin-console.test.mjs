import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [page,client,contract,restaurants]=await Promise.all([
  read('apps/frontend/app/admin/kora/page.tsx'),
  read('apps/frontend/lib/kora-admin-client.ts'),
  read('docs/decisions/RP39-KORA-ADMIN-UI.md'),
  read('apps/frontend/app/restaurants/page.tsx')
]);

test('KORA executive admin console uses the protected supervised API and no fake metrics',()=>{
  assert.match(client,/\/api\/v1\/admin\/kora/);
  for(const route of ['/metrics','/anomalies','/executive','/expose','/tasks/draft','/killcritic','/autopsy']) assert.match(client,new RegExp(route.replace('/','\\/')));
  assert.doesNotMatch(page,/Math\.random|fake|simulated views|مشاهدات وهمية/i);
  assert.match(page,/لا تنفذ تغييرات تلقائياً/);
  assert.match(page,/مسودة مهمة/);
  assert.match(page,/غير قابلة للتنفيذ التلقائي/);
});

test('KORA console links concrete route modules and their key operating clients',async()=>{
  const keyContracts=new Map([
    ['/orders/merchant',/api\.orders\.merchant\(/],
    ['/admin/taxi-pricing',/taxiPricingApi\.current\(/],
    ['/admin/taxi-drivers',/taxiOperationalReviewApi\.candidates\(/],
    ['/admin/billing',/billingApi\.pending\(/],
    ['/billing',/billingApi\.quote\(/],
    ['/admin/driver-documents',/driverDocumentsApi\.queue\(/],
    ['/orders/courier',/api\.orders\.courier\(/]
  ]);
  for(const href of ['/orders/merchant','/admin/categories','/admin/moderation','/admin/verification','/admin/operations-product','/admin/taxi-pricing','/admin/taxi-drivers','/admin/billing','/billing','/admin/driver-documents','/orders/courier']) {
    assert.match(page,new RegExp(`href=\\"${href.replaceAll('/','\\/')}\\"`));
    const route=await read(`apps/frontend/app${href}/page.tsx`);
    assert.match(route,/export default function\s+\w+\s*\(/,`${href} must export a page component`);
    if(keyContracts.has(href))assert.match(route,keyContracts.get(href),`${href} must call its operating client`);
  }
  assert.doesNotMatch(page,/واجهة Billing لم|واجهة التسعير الإدارية مستقلة وقيد الربط/);
  assert.match(page,/حفظ التسعيرة لا يفعّل الرحلات/);
  assert.match(page,/الدفع الإلكتروني غير موصول/);
});

test('restaurant discovery describes menus without claiming that search results display menu items',()=>{
  assert.match(restaurants,/افتح صفحة المطعم لتصفّح قائمته/);
  assert.doesNotMatch(restaurants,/كل المطاعم والأصناف المتاحة في مكان واحد/);
});

test('KORA page preserves truthfulness boundaries for process-local evidence',()=>{
  assert.match(page,/مؤقتة في ذاكرة عملية الخادم/);
  assert.match(contract,/autoExecutable=false/);
  assert.match(contract,/no Production action|Production deployment/i);
});
