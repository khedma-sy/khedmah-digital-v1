import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';
const professional={id:'professional-fixture',contentRevision:'a'.repeat(64),headlineAr:'مهني اختبار',headlineEn:'Test',bioAr:'نبذة',bioEn:'Existing English bio',availability:'available',cityCode:'damascus',skills:['خبرة']};
function fixture(kind='professional') {
  const loads=[],saves=[],navigations=[];const call=list=>{const d=deferred();list.push(d);return d.promise;};
  const api={auth:{session:()=>call(loads)},professionals:{getMine:()=>call(loads),createOrUpdate:body=>{const p=call(saves);saves.at(-1).body=body;return p;}},businesses:{create:body=>{const p=call(saves);saves.at(-1).body=body;return p;}}};
  const router={replace:p=>navigations.push(p),push:p=>navigations.push(p)};
  const page=clientPage(readSource(`apps/frontend/app/${kind==='professional'?'professional-profiles':'business-profiles'}/new/page.tsx`),{
    'next/navigation':{useRouter:()=>router},'../../../lib/api-client':{api},'../../components/ui-primitives':primitives,'../../../components/owner-workspace.module.css':{default:css},
    '../../../lib/use-syrian-cities':{useSyrianCities:()=>({cities:[{code:'damascus',nameAr:'دمشق'}],isLoading:false})},
    '../../../lib/use-categories':{useCategories:()=>({categories:[],isLoading:false})},'../../components/category-select-options':{CategorySelectOptions:'CategorySelectOptions'}
  },{crypto:{randomUUID:()=> 'fixture-business-request-123456'}});
  const submit=()=>page.find(n=>n.props?.as==='form').props.onSubmit({preventDefault(){}});
  return{page,loads,saves,navigations,submit,async resolve(c,v={professional}){c.resolve(v);await page.flush();},async reject(c,v=new Error('offline')){c.reject(v);await page.flush();}};
}
test('professional prefill retry ignores responses after the editor unmounts',async()=>{
  const f=fixture();await f.reject(f.loads[0]);f.page.click('إعادة تحميل الملف');f.page.unmount();await f.resolve(f.loads[1]);assert.equal(f.page.writesAfterUnmount,0);
});
test('professional save preserves an existing English bio and returns to the owner workspace',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);f.submit();assert.equal(f.saves[0].body.bioEn,professional.bioEn);await f.resolve(f.saves[0]);assert.deepEqual(f.navigations,['/professional-profiles']);
});
test('professional prefill blocks edits and submit until the existing profile is known',async()=>{
  const f=fixture();assert.ok(f.page.find(n=>n.type==='fieldset'&&n.props.disabled));f.submit();assert.equal(f.saves.length,0);
});
for(const kind of ['professional','business']){
  test(`${kind}: duplicate submit is blocked immediately and late success cannot navigate after unmount`,async()=>{
    const f=fixture(kind);await f.resolve(f.loads[0],kind==='professional'?{professional}:{user:{id:'owner'}});
    if(kind==='business'){f.page.find(n=>n.props?.autoComplete==='organization').props.onChange({target:{value:'نشاط اختبار'}});const selects=f.page.all().filter(n=>n.type==='select');selects[0].props.onChange({target:{value:'repairs'}});selects[1].props.onChange({target:{value:'damascus'}});f.page.render();}
    f.submit();f.submit();f.page.render();assert.equal(f.saves.length,1);f.page.unmount();await f.resolve(f.saves[0]);assert.equal(f.page.writesAfterUnmount,0);assert.deepEqual(f.navigations,[]);
  });
}
test('business session failures offer retry and prevent unknown-session submission',async()=>{
  const f=fixture('business');await f.reject(f.loads[0]);f.page.click('إعادة التحقق من الجلسة');assert.equal(f.loads.length,2);await f.resolve(f.loads[1],{user:{id:'owner'}});assert.ok(f.page.find(n=>n.props?.as==='form'));
});

test('professional conflict preserves the draft and requires explicit reload before another write',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);f.page.edit('headlineAr','مسودة تبويب قديم');f.submit();
  assert.equal(f.saves[0].body.expectedContentRevision,professional.contentRevision);
  await f.reject(f.saves[0],Object.assign(new Error('changed'),{statusCode:409}));
  assert.equal(f.page.find(n=>n.props.name==='headlineAr').props.value,'مسودة تبويب قديم');assert.equal(f.loads.length,1);
  f.submit();assert.equal(f.saves.length,1);f.page.click('إعادة تحميل الملف');
  await f.resolve(f.loads[1],{professional:{...professional,headlineAr:'النسخة الجديدة',contentRevision:'b'.repeat(64)}});
  f.submit();assert.equal(f.saves[1].body.headlineAr,'النسخة الجديدة');assert.equal(f.saves[1].body.expectedContentRevision,'b'.repeat(64));
});
test('professional missing content revision prevents unversioned overwrite and offers reload',async()=>{
  const f=fixture();await f.resolve(f.loads[0],{professional:{...professional,contentRevision:undefined}});f.submit();assert.equal(f.saves.length,0);assert.ok(f.page.find(n=>JSON.stringify(n.props.children)==='"إعادة تحميل الملف"'));
});
