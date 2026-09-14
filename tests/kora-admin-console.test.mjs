import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [page,client,contract]=await Promise.all([
  read('apps/frontend/app/admin/kora/page.tsx'),
  read('apps/frontend/lib/kora-admin-client.ts'),
  read('docs/decisions/RP39-KORA-ADMIN-UI.md')
]);

test('KORA executive admin console uses the protected supervised API and no fake metrics',()=>{
  assert.match(client,/\/api\/v1\/admin\/kora/);
  for(const route of ['/metrics','/anomalies','/executive','/expose','/tasks/draft','/killcritic','/autopsy']) assert.match(client,new RegExp(route.replace('/','\\/')));
  assert.doesNotMatch(page,/Math\.random|fake|simulated views|مشاهدات وهمية/i);
  assert.match(page,/لا تنفذ تغييرات تلقائياً/);
  assert.match(page,/مسودة مهمة/);
  assert.match(page,/غير قابلة للتنفيذ التلقائي/);
});

test('KORA console links only implemented administration routes and labels pending UIs',()=>{
  for(const href of ['/orders/merchant','/admin/categories','/admin/moderation','/admin/verification','/admin/operations-product']) assert.match(page,new RegExp(`href=\\"${href.replaceAll('/','\\/')}\\"`));
  assert.doesNotMatch(page,/href=\"\/admin\/taxi-pricing\"/);
  assert.doesNotMatch(page,/href=\"\/admin\/billing\"/);
  assert.match(page,/Taxi Pricing[\s\S]*API جاهز|Backend \+ Migration 029 جاهزان/);
  assert.match(page,/Billing & Points[\s\S]*Migration 030/);
});

test('KORA page preserves truthfulness boundaries for process-local evidence',()=>{
  assert.match(page,/مؤقتة في ذاكرة عملية الخادم/);
  assert.match(contract,/autoExecutable=false/);
  assert.match(contract,/no Production action|Production deployment/i);
});
