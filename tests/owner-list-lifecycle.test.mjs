import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';
const business={id:'business-1',name:'نشاط اختبار',categoryCode:'repairs',cityCode:'aleppo',visibility:'private',moderationStatus:'pending',trustStatus:'pending',status:'active'};
const professional={id:'professional-1',headlineAr:'مهني اختبار',cityCode:'aleppo',countryCode:'SY',skills:[],availability:'available',contactEligibility:{visibility:'private',moderationStatus:'pending',lifecycleStatus:'created',eligible:false}};
const product={id:'product-1',titleAr:'منتج اختبار',price:100,currency:'SYP',moderationStatus:'approved',status:'draft'};
function fixture(kind){
  const loads=[],submits=[],navigations=[];const call=list=>{const d=deferred();list.push(d);return d.promise;};
  const api={products:{listMine:()=>call(loads)},businesses:{listMine:()=>call(loads),submitForReview:id=>{const p=call(submits);submits.at(-1).id=id;return p;}},professionals:{getMine:()=>call(loads),submitForReview:()=>call(submits)}};
  const router={replace:path=>navigations.push(path)};const nested=kind==='products';
  const page=clientPage(readSource(`apps/frontend/app/${nested?'store/manage':kind==='business'?'business-profiles':'professional-profiles'}/page.tsx`),{
    'next/navigation':{useRouter:()=>router},[nested?'../../../lib/api-client':'../../lib/api-client']:{api},[nested?'../../components/ui-primitives':'../components/ui-primitives']:primitives,
    [nested?'../../components/platform-icon':'../components/platform-icon']:{PlatformIcon:'PlatformIcon'},[nested?'../store.module.css':'../../components/owner-workspace.module.css']:{default:css},
    '../../lib/use-syrian-cities':{useSyrianCities:()=>({cities:[]}),cityLabel:()=> 'حلب'},'../../lib/use-categories':{useCategories:()=>({categories:[]})}
  });
  const payload=value=>kind==='products'?{products:value??[product]}:kind==='business'?{businesses:value??[business]}:{professional:value??professional};
  return {page,loads,submits,navigations,payload,async resolve(call,value=payload()){call.resolve(value);await page.flush();},async reject(call,value=new Error('offline')){call.reject(value);await page.flush();}};
}
for(const kind of ['products','business','professional']){
  test(`${kind}: load errors are recoverable and do not claim an empty workspace`,async()=>{
    const f=fixture(kind);await f.reject(f.loads[0]);assert.equal(f.page.find(n=>n.type==='EmptyState'),undefined);f.page.click('إعادة المحاولة');await f.resolve(f.loads[1]);assert.match(f.page.text,/اختبار/);
  });
  test(`${kind}: unmounted loads do not write state or redirect after a late 401`,async()=>{
    const f=fixture(kind);f.page.unmount();await f.reject(f.loads[0],Object.assign(new Error('expired'),{statusCode:401}));assert.equal(f.page.writesAfterUnmount,0);assert.deepEqual(f.navigations,[]);
  });
  test(`${kind}: effect replay rejects an older success after the current result`,async()=>{
    const f=fixture(kind);f.page.replay();await f.resolve(f.loads[1]);await f.resolve(f.loads[0],f.payload(kind==='professional'?{...professional,headlineAr:'قديم'}:[]));assert.match(f.page.text,/اختبار/);assert.doesNotMatch(f.page.text,/قديم/);
  });
}
test('business and professional review submissions are single-flight and stop after unmount',async()=>{
  for(const kind of ['business','professional']){
    const f=fixture(kind);await f.resolve(f.loads[0]);const button=f.page.find(n=>n.type==='ActionButton');button.props.onClick();button.props.onClick();f.page.render();assert.equal(f.submits.length,1);f.page.unmount();await f.resolve(f.submits[0],{});assert.equal(f.loads.length,1);assert.equal(f.page.writesAfterUnmount,0);
  }
});
test('business submission disables other cards until the current decision completes',async()=>{
  const f=fixture('business');await f.resolve(f.loads[0],f.payload([business,{...business,id:'business-2'}]));f.page.click('إرسال للمراجعة');assert.ok(f.page.all().filter(n=>n.type==='ActionButton').every(n=>n.props.disabled));
  await f.resolve(f.submits[0],{});assert.equal(f.loads.length,2);await f.resolve(f.loads[1]);assert.match(f.page.text,/اختبار/);
});
test('business public link requires active approved trust and moderation',async()=>{
  const f=fixture('business');await f.resolve(f.loads[0],f.payload([{...business,visibility:'public'},{...business,id:'eligible',visibility:'public',moderationStatus:'approved',trustStatus:'approved'}]));
  const links=f.page.all().filter(n=>n.type==='ActionLink'&&n.props.children==='عرض الصفحة العامة');assert.equal(links.length,1);assert.equal(links[0].props.href,'/business-profiles/eligible');
});
test('professional public link follows server contact eligibility',async()=>{
  const f=fixture('professional');await f.resolve(f.loads[0]);assert.equal(f.page.find(n=>n.type==='ActionLink'&&n.props.children==='عرض الملف العام'),undefined);
});
test('approved draft products are not labelled published or linked publicly',async()=>{
  const f=fixture('products');await f.resolve(f.loads[0]);assert.doesNotMatch(f.page.text,/منشور/);assert.equal(f.page.find(n=>n.type==='ActionLink'&&n.props.children==='عرض الصفحة العامة'),undefined);
});
test('professional 404 remains a genuine empty state with a create action',async()=>{
  const f=fixture('professional');await f.reject(f.loads[0],Object.assign(new Error('not found'),{statusCode:404}));assert.ok(f.page.find(n=>n.type==='EmptyState'));
});
