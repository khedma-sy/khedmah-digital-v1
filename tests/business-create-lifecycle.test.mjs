import assert from 'node:assert/strict';
import test from 'node:test';
import {clientPage,css,deferred,primitives,readSource} from './helpers/client-page-harness.mjs';
function fixture({storage=new Map(),brokenStorage=false,owner='owner'}={}) {
  const loads=[],creates=[],navigations=[];let sequence=0;
  const call=(list,body)=>{const d={...deferred(),body};list.push(d);return d.promise;};
  const router={push:p=>navigations.push(p),replace:p=>navigations.push(p)};
  const api={auth:{session:()=>call(loads)},businesses:{create:body=>call(creates,body)}};
  const page=clientPage(readSource('apps/frontend/app/business-profiles/new/page.tsx'),{
    'next/navigation':{useRouter:()=>router},'../../../lib/api-client':{api},'../../components/ui-primitives':primitives,'../../../components/owner-workspace.module.css':{default:css},
    '../../../lib/use-syrian-cities':{useSyrianCities:()=>({cities:[],isLoading:false})},'../../../lib/use-categories':{useCategories:()=>({categories:[],isLoading:false})},'../../components/category-select-options':{CategorySelectOptions:'CategorySelectOptions'}
  },{crypto:{randomUUID:()=>`request-${owner}-${++sequence}-12345678`},sessionStorage:{getItem:k=>{if(brokenStorage)throw new Error('denied');return storage.get(k)??null;},setItem:(k,v)=>{if(brokenStorage)throw new Error('denied');storage.set(k,v);},removeItem:k=>{if(brokenStorage)throw new Error('denied');storage.delete(k);}}});
  return{page,loads,creates,navigations,storage,async loaded(){loads[0].resolve({user:{id:owner}});await page.flush();page.edit('name','نشاط اختبار');page.edit('categoryCode','repairs');page.edit('cityCode','damascus');},submit(){page.find(n=>n.props?.as==='form').props.onSubmit({preventDefault(){}});},async reject(c,error=new Error('response lost')){c.reject(error);await page.flush();},async resolve(c,value={business:{id:'saved'}}){c.resolve(value);await page.flush();}};
}
test('business lost response retries the same creation and double submit is blocked',async()=>{
  const f=fixture();await f.loaded();f.submit();f.submit();assert.equal(f.creates.length,1);const key=f.creates[0].body.clientRequestId;
  await f.reject(f.creates[0]);f.submit();assert.equal(f.creates[1].body.clientRequestId,key);assert.deepEqual(f.navigations,[]);
});
test('business request survives page reload and belongs to the selected account',async()=>{
  const storage=new Map();const f=fixture({storage});await f.loaded();f.submit();const key=f.creates[0].body.clientRequestId;f.page.unmount();
  const g=fixture({storage});await g.loaded();g.submit();assert.equal(g.creates[0].body.clientRequestId,key);
  const other=fixture({storage,owner:'another'});await other.loaded();other.submit();assert.notEqual(other.creates[0].body.clientRequestId,key);
});
test('business storage denial still allows an in-page retry with the same identity',async()=>{
  const f=fixture({brokenStorage:true});await f.loaded();f.submit();await f.reject(f.creates[0]);f.submit();assert.equal(f.creates[0].body.clientRequestId,f.creates[1].body.clientRequestId);
});
test('business confirmed success clears only its own marker and then navigates',async()=>{
  const storage=new Map([['khedmah.business-create.someone-else','other-marker']]);const f=fixture({storage});await f.loaded();f.submit();assert.deepEqual(f.navigations,[]);await f.resolve(f.creates[0]);
  assert.deepEqual(f.navigations,['/business-profiles']);assert.equal(storage.has('khedmah.business-create.owner'),false);assert.equal(storage.get('khedmah.business-create.someone-else'),'other-marker');
});
test('business changed replay preserves fields and offers explicit resume without automatic creation',async()=>{
  const f=fixture();await f.loaded();f.submit();await f.reject(f.creates[0],Object.assign(new Error('exists'),{statusCode:409,code:'BUSINESS_DRAFT_EXISTS',businessId:'saved'}));
  f.submit();assert.equal(f.creates.length,1);assert.equal(f.page.find(n=>n.props.name==='name').props.value,'نشاط اختبار');assert.ok(f.page.find(n=>n.props.href==='/business-profiles/saved/manage'));
  const previous=f.creates[0].body.clientRequestId;f.page.click('بدء نشاط آخر');f.submit();assert.notEqual(f.creates[1].body.clientRequestId,previous);
});
test('business success after unmount retains recovery marker and does not navigate or update state',async()=>{
  const f=fixture();await f.loaded();f.submit();f.page.unmount();await f.resolve(f.creates[0]);assert.equal(f.page.writesAfterUnmount,0);assert.deepEqual(f.navigations,[]);assert.ok(f.storage.has('khedmah.business-create.owner'));
});
