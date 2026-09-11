import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, loadSource, primitives, deferred, readSource } from './helpers/client-page-harness.mjs';
const discovery = loadSource(readSource('apps/frontend/lib/discovery-context.ts'), {});
const maps = loadSource(readSource('apps/frontend/lib/map-context.ts'), {'./discovery-context': discovery});
const catalog = [{code:'root',nameAr:'الصيانة',visualKey:'home'},{code:'plumbing',parentCode:'root',nameAr:'سباكة',visualKey:'home'}];
function fixture(query='') {
  let params = new URLSearchParams(query);
  let metadata = { categories: catalog, isLoading:false, error:'', retry: () => { retries += 1; } };
  let retries=0;
  const requests=[], navigations=[];
  const router={push:href=>navigations.push(href),replace:href=>navigations.push(href)};
  const api={services:{search:body=>{const d=deferred();d.body=body;requests.push(d);return d.promise;}}};
  const h=clientPage(readSource('apps/frontend/app/components/category-directory.tsx')+'\nexport default CategoryDirectory;',{
    'next/link':{default:'Link'},'next/navigation':{useRouter:()=>router,useSearchParams:()=>params},
    '../../lib/api-client':{api},'../../lib/map-context':maps,'./platform-icon':{PlatformIcon:'PlatformIcon'},
    '../../lib/use-categories':{useCategories:()=>metadata},'../../lib/discovery-context':discovery,'./ui-primitives':primitives
  },{window:{scrollTo(){}}});
  return {h,requests,navigations,get retries(){return retries;},
    navigate(query){params=new URLSearchParams(query);h.render();},
    metadata(next){metadata={...metadata,...next};h.render();},
    async resolve(i,services=[],total=services.length){requests[i].resolve({services,total});await h.flush();},
    async reject(i){requests[i].reject(new Error('offline'));await h.flush();}
  };
}
for (const query of ['', 'q=كهربائي&cityCode=damascus']) test(`directory empty search has explicit recovery: ${query || 'all'}`,async()=>{
  const f=fixture(query);await f.resolve(0);assert.ok(f.h.find(n=>n.type==='EmptyState'));
  assert.ok(f.h.find(n=>n.type==='ActionLink'&&n.props.href.startsWith('/map')));
});
for (const total of [0,7]) test(`out-of-range directory page recovers without clearing filters (total ${total})`,async()=>{
  const f=fixture('q=صيانة&cityCode=damascus&categoryCode=plumbing&page=99');await f.resolve(0,[],total);
  f.h.click('العودة إلى الصفحة الأولى');const p=new URLSearchParams(f.navigations.at(-1).split('?')[1]);
  assert.equal(p.get('q'),'صيانة');assert.equal(p.get('cityCode'),'damascus');assert.equal(p.get('categoryCode'),'plumbing');assert.equal(p.get('page'),null);
});
for (const ownerType of ['business','professional']) test(`directory provider link is a single encoded path segment: ${ownerType}`,async()=>{
  const f=fixture('categoryCode=plumbing');await f.resolve(0,[{id:'s',ownerType,ownerId:'a/b?#x',titleAr:'خدمة',categoryCode:'plumbing'}]);
  assert.ok(f.h.find(n=>n.type==='Link'&&n.props.href===`/${ownerType==='business'?'business-profiles':'professional-profiles'}/a%2Fb%3F%23x`));
});

test('directory pagination cannot produce an unsafe server offset',()=>{
  assert.equal(discovery.discoveryPage(String(Number.MAX_SAFE_INTEGER)),1);
  assert.equal(discovery.discoveryPage('100000'),100000);
});

test('category selection preserves city and query and only navigation issues the new request',async()=>{
  const f=fixture('q=صيانة&cityCode=damascus');await f.resolve(0);
  f.h.find(n=>n.type==='button'&&n.props.onClick&&JSON.stringify(n.props.children).includes('الصيانة')).props.onClick();f.h.render();
  assert.equal(f.requests.length,1);const p=new URLSearchParams(f.navigations[0].split('?')[1]);
  assert.equal(p.get('categoryCode'),'root');assert.equal(p.get('cityCode'),'damascus');assert.equal(p.get('q'),'صيانة');
  f.navigate(p.toString());assert.equal(f.requests.length,2);assert.equal(f.requests[1].body.cityCode,'damascus');
});

test('directory Back/Forward ignores a stale result and restores the applied page',async()=>{
  const f=fixture('categoryCode=root&page=2');f.navigate('categoryCode=plumbing&page=3');
  await f.resolve(1,[{id:'n',ownerType:'business',ownerId:'n',titleAr:'جديد',categoryCode:'plumbing'}],60);
  await f.resolve(0,[{id:'o',ownerType:'business',ownerId:'o',titleAr:'قديم',categoryCode:'root'}],60);
  assert.match(f.h.text,/جديد/);assert.doesNotMatch(f.h.text,/قديم/);assert.equal(f.requests[1].body.page,3);
});

test('API failure remains an error; retry retains the complete filter context',async()=>{
  const f=fixture('q=صيانة&categoryCode=plumbing&cityCode=damascus&page=2');await f.reject(0);
  assert.equal(f.h.find(n=>n.type==='EmptyState'),undefined);f.h.click('إعادة المحاولة');
  assert.equal(JSON.stringify(f.requests[1].body),JSON.stringify(f.requests[0].body));await f.resolve(1,[],0);assert.ok(f.h.find(n=>n.type==='EmptyState'));
});

test('unmount ignores a directory request completion',async()=>{
  const f=fixture();f.h.unmount();await f.resolve(0);assert.equal(f.h.writesAfterUnmount,0);
});

test('metadata failure invalidates old results and offers registry retry without broadening',async()=>{
  const f=fixture('categoryCode=plumbing');f.metadata({error:'unavailable'});await f.resolve(0,[{id:'s',titleAr:'لا تعرض',ownerType:'business',ownerId:'x'}]);
  assert.doesNotMatch(f.h.text,/لا تعرض/);f.h.click('إعادة تحميل التصنيفات');assert.equal(f.retries,1);assert.equal(f.requests.length,1);
});

test('unknown category does not issue an unfiltered query',()=>{
  const f=fixture('categoryCode=missing');assert.equal(f.requests.length,0);assert.ok(f.h.find(n=>n.type==='StatusMessage'&&n.props.tone==='warning'));
});

test('directory-to-map carries query city category but not list pagination',async()=>{
  const f=fixture('q=صيانة&categoryCode=plumbing&cityCode=damascus&page=3');await f.resolve(0);
  const link=f.h.find(n=>n.type==='ActionLink'&&n.props.href.startsWith('/map'));const p=new URLSearchParams(link.props.href.split('?')[1]);
  assert.equal(p.get('q'),'صيانة');assert.equal(p.get('categoryCode'),'plumbing');assert.equal(p.get('cityCode'),'damascus');assert.equal(p.get('page'),null);
});
