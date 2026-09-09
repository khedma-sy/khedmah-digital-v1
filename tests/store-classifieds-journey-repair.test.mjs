import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, primitives, css, deferred, readSource } from './helpers/client-page-harness.mjs';
const product=(titleAr='منتج حديث',id='p')=>({id,titleAr,price:0,currency:'SYP',businessName:'متجر اختبار',cityCode:'damascus',availability:'in_stock'});
function fixture({path='/store',query='',categoryError='',cityError='',cityLoading=false}={}) {
 let pathname=path,params=new URLSearchParams(query);
 let categories={categories:[{code:'shopping',nameAr:'تسوق'}],isLoading:false,error:categoryError,retry:()=>{categoryRetries++;}};
 let cities={cities:[{code:'damascus',nameAr:'دمشق'},{code:'aleppo',nameAr:'حلب'}],isLoading:cityLoading,error:cityError,retry:()=>{cityRetries++;}};
 let categoryRetries=0,cityRetries=0;
 const requests=[],navigations=[];
 const api={products:{list:body=>{const d=deferred();d.body=body;requests.push(d);return d.promise;}}};
 const router={push:href=>navigations.push(href),replace:href=>navigations.push(href)};
 const runtime={location:{search:query?`?${query}`:'',pathname:path},history:{replaceState:(_,__,href)=>navigations.push(href)},scrollTo(){}};
 let source=readSource('apps/frontend/app/store/page.tsx').replace('export default function StorePage()', 'function StorePage()');
 source+=`\nexport default ${source.includes('function StoreContent(')?'StoreContent':'StorePage'};`;
 const h=clientPage(source,{
  'next/link':{default:'Link'},'next/navigation':{useRouter:()=>router,useSearchParams:()=>params,usePathname:()=>pathname},
  '../../lib/api-client':{api},'../../lib/use-categories':{useCategories:()=>categories},
  '../../lib/use-syrian-cities':{useSyrianCities:()=>cities,canonicalCityCode:(v,c)=>c.some(i=>i.code===v)?v:undefined,cityLabel:(v,c)=>c.find(i=>i.code===v)?.nameAr??v},
  '../components/category-select-options':{CategorySelectOptions:'CategorySelectOptions'},'../components/ui-primitives':primitives,
  '../components/platform-icon':{PlatformIcon:'PlatformIcon'},'./store.module.css':{default:css}
 },{window:runtime});
 function navigate(href){const [p,q='']=href.split('?');pathname=p;params=new URLSearchParams(q);runtime.location={search:`?${params}`,pathname};h.render();}
 return {h,requests,navigations,navigate,
  edit(field,value){const node=field==='q'?h.find(n=>n.type==='input'):h.all().filter(n=>n.type==='select')[field==='categoryCode'?0:1];node.props.onChange({target:{value}});h.render();},
  submit(){const n=navigations.length;h.submit();if(navigations.length>n)navigate(navigations.at(-1));},
  async resolve(i,products=[product()]){requests[i].resolve({products});await h.flush();},
  async reject(i){requests[i].reject(new Error('offline'));await h.flush();},
  metadata(type,patch){if(type==='city')cities={...cities,...patch};else categories={...categories,...patch};h.render();},
  get categoryRetries(){return categoryRetries;},get cityRetries(){return cityRetries;}
 };
}
for (const path of ['/store','/classifieds']) {
 test(`${path}: filter submission stays on its current route and preserves all filters`,async()=>{
  const f=fixture({path});await f.resolve(0);f.edit('q','  هاتف  ');f.edit('cityCode','damascus');f.edit('categoryCode','shopping');f.submit();
  const [p,q]=f.navigations.at(-1).split('?');assert.equal(p,path);const params=new URLSearchParams(q);
  assert.equal(params.get('q'),'هاتف');assert.equal(params.get('cityCode'),'damascus');assert.equal(params.get('categoryCode'),'shopping');
  assert.equal(f.requests.at(-1).body.q,'هاتف');
 });
 test(`${path}: browser Back/Forward restores fields and sends the matching query`,async()=>{
  const f=fixture({path,query:'q=old&cityCode=damascus'});await f.resolve(0);f.navigate(`${path}?q=new&cityCode=aleppo`);
  assert.equal(f.h.find(n=>n.type==='input').props.value,'new');assert.equal(f.requests.at(-1).body.cityCode,'aleppo');
 });
 test(`${path}: a late response cannot replace a newer query`,async()=>{
  const f=fixture({path});f.edit('q','جديد');f.submit();await f.resolve(1,[product('النتيجة الجديدة')]);await f.resolve(0,[product('النتيجة القديمة')]);
  assert.match(f.h.text,/النتيجة الجديدة/);assert.doesNotMatch(f.h.text,/النتيجة القديمة/);
 });
 test(`${path}: an old completion cannot end the current loading state`,async()=>{
  const f=fixture({path});f.edit('q','جديد');f.submit();await f.resolve(0,[product('قديم')]);
  assert.ok(f.h.find(n=>n.type==='SkeletonGrid'));assert.doesNotMatch(f.h.text,/قديم/);await f.resolve(1);
 });
 test(`${path}: an old failure cannot corrupt the newest success`,async()=>{
  const f=fixture({path});f.edit('q','جديد');f.submit();await f.resolve(1);await f.reject(0);
  assert.equal(f.h.find(n=>n.type==='StatusMessage'&&n.props.tone==='danger'),undefined);assert.match(f.h.text,/منتج حديث/);
 });
 test(`${path}: API failure hides obsolete products and offers retry without a fake empty result`,async()=>{
  const f=fixture({path});await f.resolve(0,[product('قديم')]);f.edit('q','جديد');f.submit();await f.reject(1);
  assert.doesNotMatch(f.h.text,/قديم/);assert.equal(f.h.find(n=>n.type==='EmptyState'),undefined);
  f.h.click('إعادة تحميل المنتجات');assert.equal(f.requests[2].body.q,'جديد');await f.resolve(2);
 });
 test(`${path}: clearing filters stays within its route`,async()=>{
  const f=fixture({path,query:'q=هاتف'});await f.resolve(0);f.h.click('مسح');assert.equal(f.navigations.at(-1),path);
 });
 test(`${path}: valid empty results are explicit and not a network error`,async()=>{
  const f=fixture({path});await f.resolve(0,[]);assert.ok(f.h.find(n=>n.type==='EmptyState'));assert.equal(f.h.find(n=>n.type==='StatusMessage'&&n.props.tone==='danger'),undefined);
 });
 test(`${path}: unmounted requests cannot update the page`,async()=>{
  const f=fixture({path});f.h.unmount();await f.resolve(0);assert.equal(f.h.writesAfterUnmount,0);
 });
}

test('store is named متجر خدمة rather than advertising an independent ads system',()=>{
 const f=fixture();assert.equal(f.h.find(n=>n.type==='PageHeader').props.title,'متجر خدمة');
});
test('classifieds declares its current product-offer scope instead of a fake independent ad submission',()=>{
 const f=fixture({path:'/classifieds'});assert.match(f.h.find(n=>n.type==='PageHeader').props.title,/إعلانات/);
 assert.match(f.h.text,/الإعلانات المستقلة/);assert.equal(f.h.find(n=>n.type==='ActionLink'&&n.props.children==='أضف إعلانًا'),undefined);
 assert.match(readSource('apps/frontend/app/classifieds/page.tsx'),/from '\.\.\/store\/page'/);
});

test('selected city waits for the canonical registry; no silent broadening',()=>{
 const f=fixture({query:'cityCode=damascus',cityLoading:true});assert.equal(f.requests.length,0);f.metadata('city',{isLoading:false});assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.cityCode,'damascus');
});
for(const [type,options] of [['city',{cityError:'فشل المدن',query:'cityCode=damascus'}],['category',{categoryError:'فشل التصنيفات',query:'categoryCode=shopping'}]])test(`${type} failure preserves the selected code and exposes registry retry`,()=>{
 const f=fixture(options);assert.equal(f.requests.length,0);assert.ok(f.h.find(n=>n.type==='select'&&n.props.value===(type==='city'?'damascus':'shopping')));
 f.h.click(type==='city'?'إعادة تحميل المدن':'إعادة تحميل التصنيفات');assert.equal(type==='city'?f.cityRetries:f.categoryRetries,1);
});
for(const query of ['cityCode=missing','categoryCode=missing'])test(`unknown filter is rejected before a products query: ${query}`,()=>{
 const f=fixture({query});assert.equal(f.requests.length,0);assert.ok(f.h.find(n=>n.type==='StatusMessage'&&n.props.tone==='danger'));
});

test('editing a filter does not silently change already-applied results',async()=>{
 const f=fixture({query:'q=old'});await f.resolve(0);f.edit('q','draft');assert.equal(f.requests.length,1);assert.match(f.h.text,/منتج حديث/);
});

test('product detail links encode identifiers without manufacturing a checkout',async()=>{
 const f=fixture();await f.resolve(0,[product('منتج','p/a?x#y')]);
 assert.ok(f.h.find(n=>n.type==='ActionLink'&&n.props.href==='/store/products/p%2Fa%3Fx%23y'));
 assert.equal(f.h.find(n=>n.props.href?.includes('checkout')),undefined);
});

test('malformed success data surfaces a recoverable error, not a render exception',async()=>{
 const f=fixture();f.requests[0].resolve({});await f.h.flush();assert.ok(f.h.find(n=>n.type==='StatusMessage'&&n.props.tone==='danger'));
});
