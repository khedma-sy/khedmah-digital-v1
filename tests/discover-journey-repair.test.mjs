import assert from 'node:assert/strict';
import test from 'node:test';
import {clientPage,loadSource,primitives,css,deferred,readSource} from './helpers/client-page-harness.mjs';
const discovery=loadSource(readSource('apps/frontend/lib/discovery-context.ts'),{});
const searchContext=loadSource(readSource('apps/frontend/lib/search-context.ts'),{'./discovery-context':discovery});
const mapContext=loadSource(readSource('apps/frontend/lib/map-context.ts'),{'./discovery-context':discovery});
const business=(id='b',name='نشاط حديث')=>({id,name,categoryCode:'plumbing',cityCode:'damascus',trustStatus:'approved'});
const professional=(id='p')=>({id,headlineAr:'مهني حديث',cityCode:'damascus',skills:[],availability:'available'});
const service=(id='s',ownerType='business')=>({id,ownerId:'owner/a',ownerType,titleAr:'خدمة حديثة',categoryCode:'plumbing',priceType:'negotiable'});
function fixture({query='',cityLoading=false,cityError='',categoryError=''}={}){
 let params=new URLSearchParams(query);
 let cities={cities:[{code:'damascus',nameAr:'دمشق'},{code:'aleppo',nameAr:'حلب'}],isLoading:cityLoading,error:cityError,retry(){}};
 const categories={categories:[{code:'plumbing',nameAr:'سباكة'}],isLoading:false,error:categoryError,retry(){}};
 const requests=[],navigations=[];
 const call=type=>body=>{const d=deferred();d.type=type;d.body=body;requests.push(d);return d.promise;};
 const api={search:{query:call('all')},businesses:{search:call('business')},professionals:{search:call('professional')},services:{search:call('service')}};
 const router={push:href=>navigations.push(href),replace:href=>navigations.push(href)};
 const h=clientPage(readSource('apps/frontend/app/search/page.tsx').replace('export default function SearchPage()','function SearchPage()')+'\nexport default SearchContent;',{
  'next/navigation':{useRouter:()=>router,useSearchParams:()=>params},'../../lib/api-client':{api},
  '../../lib/use-syrian-cities':{useSyrianCities:()=>cities,canonicalCityCode:(v,c)=>c.some(i=>i.code===v)?v:undefined,cityLabel:v=>v},
  '../../lib/use-categories':{useCategories:()=>categories},'../../lib/search-context':searchContext,'../../lib/map-context':mapContext,
  '../components/platform-icon':{PlatformIcon:'PlatformIcon'},'../components/category-select-options':{CategorySelectOptions:'CategorySelectOptions'},
  '../components/ui-primitives':primitives,'../discovery.module.css':{default:css}
 },{window:{scrollTo(){}}});
 return{h,requests,navigations,
  edit(id,value){h.find(n=>n.props.id===id).props.onChange({target:{value}});h.render();},
  tab(label){h.click(label);},navigate(q){params=new URLSearchParams(q);h.render();},
  metadata(patch){cities={...cities,...patch};h.render();},
  async resolve(i,data={}){requests[i].resolve({businesses:[],professionals:[],services:[],total:0,...data});await h.flush();},
  async reject(i){requests[i].reject(new Error('offline previous query'));await h.flush();}
 };
}

test('discover landing does not query until a search is requested',()=>{const f=fixture();assert.equal(f.requests.length,0);assert.ok(f.h.find(n=>n.type==='EmptyState'));});
test('tab change invalidates the pending previous result before route commit',async()=>{
 const f=fixture({query:'q=old&type=business'});f.tab('الخدمات');await f.resolve(0,{businesses:[business('old','قديم')],total:1});
 assert.doesNotMatch(f.h.text,/قديم/);assert.ok(f.h.find(n=>n.type==='SkeletonGrid'));assert.equal(f.requests.length,1);
});
test('clear invalidates an in-flight result before navigation commits',async()=>{
 const f=fixture({query:'q=old&type=business'});f.h.click('مسح');await f.resolve(0,{businesses:[business('old','قديم')],total:1});
 assert.doesNotMatch(f.h.text,/قديم/);f.navigate('');assert.equal(f.requests.length,1);assert.ok(f.h.find(n=>n.type==='EmptyState'));
});
test('old network errors cannot surface while a new tab navigation is pending',async()=>{
 const f=fixture({query:'q=old&type=business'});f.tab('الخدمات');await f.reject(0);assert.doesNotMatch(f.h.text,/offline previous query/);
});
test('submitting a new query hides already-rendered results until its matching URL commits',async()=>{
 const f=fixture({query:'q=old&type=business'});await f.resolve(0,{businesses:[business('old','قديم')],total:1});f.edit('q','new');f.h.submit();
 assert.doesNotMatch(f.h.text,/قديم/);assert.ok(f.h.find(n=>n.type==='SkeletonGrid'));assert.equal(f.requests.length,1);
 f.navigate(f.navigations.at(-1).split('?')[1]);assert.equal(f.requests[1].body.q,'new');
});
test('Back/Forward restores all fields and only sends the corresponding request',async()=>{
 const f=fixture({query:'q=old&type=business&cityCode=damascus'});await f.resolve(0);f.navigate('q=new&type=service&cityCode=aleppo&categoryCode=plumbing&page=2');
 assert.equal(f.h.find(n=>n.props.id==='q').props.value,'new');assert.equal(f.requests[1].type,'service');assert.equal(f.requests[1].body.cityCode,'aleppo');assert.equal(f.requests[1].body.page,2);
 f.navigate('q=old&type=business&cityCode=damascus');assert.equal(f.h.find(n=>n.props.id==='q').props.value,'old');assert.equal(f.requests.at(-1).type,'business');
});
test('an old completion cannot end the newest loading state',async()=>{
 const f=fixture({query:'q=old&type=business'});f.navigate('q=new&type=service');await f.resolve(0,{businesses:[business('old','قديم')],total:1});assert.ok(f.h.find(n=>n.type==='SkeletonGrid'));assert.doesNotMatch(f.h.text,/قديم/);
});
test('an old failure cannot replace the newest success',async()=>{
 const f=fixture({query:'q=old&type=business'});f.navigate('q=new&type=service');await f.resolve(1,{services:[service()],total:1});await f.reject(0);assert.match(f.h.text,/خدمة حديثة/);assert.doesNotMatch(f.h.text,/offline/);
});
test('unmounted discovery results and errors cannot write state',async()=>{
 for(const outcome of ['resolve','reject']){const f=fixture({query:'type=all'});f.h.unmount();await f[outcome](0);assert.equal(f.h.writesAfterUnmount,0);}
});
test('effect replay invalidates the first discovery request',async()=>{
 const f=fixture({query:'type=business'});f.h.replay();await f.resolve(1,{businesses:[business()],total:1});await f.reject(0);assert.match(f.h.text,/نشاط حديث/);assert.doesNotMatch(f.h.text,/offline/);
});
test('unsubmitted text does not silently change results or page navigation context',async()=>{
 const f=fixture({query:'q=applied&type=business'});await f.resolve(0,{businesses:[business()],total:60});f.edit('q','draft');assert.equal(f.requests.length,1);f.h.click('التالي');
 const q=new URLSearchParams(f.navigations.at(-1).split('?')[1]);assert.equal(q.get('q'),'applied');assert.equal(q.get('page'),'2');
});
test('professional search cannot forward a business category',()=>{
 const f=fixture({query:'q=صيانة&type=professional&categoryCode=plumbing&cityCode=damascus'});assert.equal(f.requests[0].type,'professional');assert.equal(f.requests[0].body.categoryCode,undefined);assert.ok(f.navigations.length);
});
test('selected city waits for reference data without a wider search',()=>{
 const f=fixture({query:'cityCode=damascus&type=business',cityLoading:true});assert.equal(f.requests.length,0);f.metadata({isLoading:false});assert.equal(f.requests[0].body.cityCode,'damascus');
});
for(const options of [{query:'cityCode=unknown&type=business'},{query:'categoryCode=unknown&type=service'},{query:'cityCode=damascus&type=all',cityError:'unavailable'},{query:'categoryCode=plumbing&type=all',categoryError:'unavailable'}])test(`invalid or unavailable filters do not broaden discovery: ${JSON.stringify(options)}`,()=>{
 const f=fixture(options);assert.equal(f.requests.length,0);assert.ok(f.h.find(n=>n.props.tone==='danger'));
});
test('retry keeps the applied filters instead of the newer text draft',async()=>{
 const f=fixture({query:'q=applied&type=business&cityCode=damascus'});await f.reject(0);f.edit('q','draft');f.h.click('إعادة المحاولة');assert.equal(f.requests[1].body.q,'applied');assert.equal(f.requests[1].body.cityCode,'damascus');
});
for(const [type,data,href]of[
 ['business',{businesses:[business('owner/a')],total:1},'/business-profiles/owner%2Fa'],
 ['professional',{professionals:[professional('owner/a')]},'/professional-profiles/owner%2Fa'],
 ['service',{services:[service()],total:1},'/business-profiles/owner%2Fa'],
 ['service',{services:[service('s','professional')],total:1},'/professional-profiles/owner%2Fa']
])test(`discovery ${type} profile links encode identifiers: ${href}`,async()=>{
 const f=fixture({query:`type=${type}`});await f.resolve(0,data);assert.ok(f.h.find(n=>n.type==='ActionLink'&&n.props.href===href));
});
test('opening the map carries only the applied filters, never a draft or page number',async()=>{
 const f=fixture({query:'q=applied&type=business&cityCode=damascus&page=2'});await f.resolve(0);f.edit('q','draft');
 const link=f.h.find(n=>n.type==='ActionLink'&&n.props.href.startsWith('/map'));const q=new URLSearchParams(link.props.href.split('?')[1]);assert.equal(q.get('q'),'applied');assert.equal(q.get('page'),null);
});
for(const[page,total,b,s,expected]of[
 [1,40,20,20,false],[2,80,20,20,false],[2,61,20,1,false],[3,120,20,20,false],
 [2,100,20,20,true],[2,60,20,0,true],[2,40,20,0,false],[2,1,0,0,false]
])test(`combined search pagination accounts for both independently paged collections: ${page}/${total}/${b}/${s}`,()=>{
 const result=searchContext.searchPagination('all',page,total,{businesses:b,services:s,professionals:0});assert.equal(result.totalPages,null);assert.equal(result.canNext,expected);
});
test('professional search without total does not invent numbered pages',()=>{
 assert.equal(searchContext.searchPagination('professional',2,0,{businesses:0,services:0,professionals:20}).canNext,true);
 assert.equal(searchContext.searchPagination('professional',2,0,{businesses:0,services:0,professionals:2}).totalPages,null);
});
