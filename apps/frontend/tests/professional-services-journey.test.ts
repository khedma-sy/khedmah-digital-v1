import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('customer and provider surfaces expose the governed professional service journey',async()=>{const [create,mine,provider,client]=await Promise.all([read('app/professional-services/new/page.tsx'),read('app/professional-services/page.tsx'),read('app/professional-opportunities/page.tsx'),read('lib/api-client.ts')]);assert.match(create,/حتى 5 صور/);assert.match(create,/العنوان التفصيلي — لا يظهر قبل قبول العرض/);assert.match(mine,/قبول هذا العرض/);assert.match(mine,/اعتماد الإنجاز والدفع النقدي/);assert.match(mine,/طلب إعادة إصلاح/);assert.match(provider,/المهام المقبولة/);assert.match(provider,/أجرة الكشف/);assert.match(provider,/الضمان بالأيام/);assert.match(client,/professionalServices/);});
