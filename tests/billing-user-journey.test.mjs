import assert from 'node:assert/strict';
import test from 'node:test';
import {clientPage,css,deferred,loadSource,primitives,readSource} from './helpers/client-page-harness.mjs';

const plan={code:'starter_monthly',nameAr:'بداية شهري',billingCycle:'monthly',durationMonths:1,priceMinor:150000,pointsGranted:500,features:[]};
const quoted={plan,amountMinor:150000,discountMinor:45000,totalMinor:105000};
function fixture(){
  const quotes=[],creates=[];let sequence=0;
  const call=(list,args)=>{const request={...deferred(),args};list.push(request);return request.promise;};
  const billingApi={plans:async()=>({plans:[plan]}),me:async()=>({billing:{pointsAvailable:0,orders:[],subscriptions:[]}}),promotion:async()=>({promotion:null}),quote:(...args)=>call(quotes,args),create:(...args)=>call(creates,args)};
  const helpers=loadSource(readSource('apps/frontend/lib/billing-client.ts'),{});
  const page=clientPage(readSource('apps/frontend/app/billing/page.tsx'),{
    '../../lib/billing-client':{...helpers,billingApi},'../../lib/official-links':{KHEDMAH_WHATSAPP_CONTACT_URL:'https://example.test/contact'},'../components/ui-primitives':primitives,'./billing.module.css':{default:css}
  },{crypto:{randomUUID:()=>`billing-request-${++sequence}-fixture`}});
  return {page,quotes,creates};
}
test('billing discards a quote when the discount selection changes before the response arrives',async()=>{
  const f=fixture();await f.page.flush();f.page.submit();assert.equal(f.quotes.length,1);
  const input=f.page.find(node=>node.type==='input'&&node.props.dir==='ltr');input.props.onChange({target:{value:'DIFFERENT'}});f.page.render();
  f.quotes[0].resolve(quoted);await f.page.flush();
  assert.equal(f.page.text.includes('إنشاء طلب الاشتراك بهذا الإجمالي'),false);
});
test('billing creates from the server total and retries a lost response with the same request identity',async()=>{
  const f=fixture();await f.page.flush();f.page.submit();f.quotes[0].resolve(quoted);await f.page.flush();
  const button=f.page.find(node=>node.type==='ActionButton'&&node.props.children==='إنشاء طلب الاشتراك بهذا الإجمالي');
  button.props.onClick();button.props.onClick();f.page.render();assert.equal(f.creates.length,1);assert.equal(f.creates[0].args[3],105000);
  f.creates[0].reject(new Error('lost response'));await f.page.flush();f.page.click('إنشاء طلب الاشتراك بهذا الإجمالي');assert.equal(f.creates.length,2);assert.equal(f.creates[1].args[2],f.creates[0].args[2]);
  f.creates[1].resolve({order:{id:'saved-order',planCode:plan.code,amountMinor:150000,discountMinor:45000,totalMinor:105000,status:'pending',createdAt:new Date().toISOString()}});await f.page.flush();
  assert.ok(f.page.text.includes('بانتظار السداد والمراجعة'));assert.equal(f.page.text.includes('تم تأكيد السداد'),false);
});
