import assert from 'node:assert/strict';
import test from 'node:test';
import {clientPage,css,deferred,primitives,readSource} from './helpers/client-page-harness.mjs';
const business=id=>({id,contentRevision:'a'.repeat(64),name:`نشاط ${id}`,categoryCode:'repairs',cityCode:'damascus',visibility:'private',moderationStatus:'pending',trustStatus:'pending',status:'active'});
function fixture(){
  let id='one';const loads=[],mutations=[],navigations=[],readers=[];
  const call=(list,body)=>{const d=deferred();d.body=body;list.push(d);return d.promise;};
  const api={auth:{session:async()=>({user:{id:'owner'}})},businesses:{listMine:()=>call(loads),listReceivedInquiries:async()=>({inquiries:[]}),getOpeningHours:async()=>({hours:[]}),getBranches:async()=>({branches:[]}),getSocialLinks:async()=>({links:[]}),getVerificationStatus:async()=>({status:null}),getMedia:async()=>({assets:[]}),setOpeningHours:(id,hours)=>call(mutations,{id,hours}),update:(id,body)=>call(mutations,{id,...body}),requestVerification:id=>call(mutations,{id}),submitForReview:id=>call(mutations,{id})},services:{listForOwner:async()=>({services:[]}),create:body=>call(mutations,body)},media:{uploadBusiness:(id,body)=>call(mutations,{id,...body})}};
  const router={replace:p=>navigations.push(p)};
  const page=clientPage(readSource('apps/frontend/app/business-profiles/[id]/manage/page.tsx'),{
    'next/link':{default:'Link'},'next/navigation':{useParams:()=>({id}),useRouter:()=>router},'../../../../lib/api-client':{api},'../../../components/ui-primitives':primitives,'../../../components/platform-icon':{PlatformIcon:'PlatformIcon'},'../../../components/category-select-options':{CategorySelectOptions:'CategorySelectOptions'},'./provider-core.module.css':{default:css},'../../../../lib/use-categories':{useCategories:()=>({categories:[]})},'../../../../lib/use-syrian-cities':{useSyrianCities:()=>({cities:[]})}
  },{FileReader:class{readAsDataURL(){readers.push(this);}}});
  const form=name=>page.find(n=>n.props?.onSubmit?.name===name);
  return{page,loads,mutations,navigations,form,api,readers,changeId(next){id=next;page.render();},submit(name){form(name).props.onSubmit({preventDefault(){}});page.render();},async resolve(c,v={businesses:[business(id)]}){c.resolve(v);await page.flush();},async reject(c,v=new Error('offline')){c.reject(v);await page.flush();}};
}
test('failed business workspace load offers retry without exposing editable fallback data',async()=>{
  const f=fixture();await f.reject(f.loads[0]);assert.equal(f.form('saveHours'),undefined);f.page.click('إعادة المحاولة');await f.resolve(f.loads[1]);assert.ok(f.form('saveHours'));
});
test('route change ignores stale workspace results and stale 401 navigation',async()=>{
  const f=fixture();f.changeId('two');await f.resolve(f.loads[1]);await f.resolve(f.loads[0],{businesses:[business('one')]});assert.deepEqual(f.navigations,[]);assert.doesNotMatch(f.page.text,/نشاط one/);
  const g=fixture();g.changeId('two');await g.resolve(g.loads[1]);await g.reject(g.loads[0],Object.assign(new Error('expired'),{statusCode:401}));assert.deepEqual(g.navigations,[]);
});
test('unmount cancels the workspace and action continuation',async()=>{
  const first=fixture();first.page.unmount();await first.resolve(first.loads[0]);assert.equal(first.page.writesAfterUnmount,0);
  const f=fixture();await f.resolve(f.loads[0]);f.submit('saveHours');f.page.unmount();await f.resolve(f.mutations[0],{hours:[]});assert.equal(f.page.writesAfterUnmount,0);
});
test('one owner mutation is allowed at a time even before button state renders',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);const form=f.form('saveHours');form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});f.page.render();assert.equal(f.mutations.length,1);
});
test('late action on an old business cannot replace the current workspace data',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);f.submit('saveHours');f.changeId('two');await f.resolve(f.loads[1]);await f.resolve(f.mutations[0],{hours:[{dayOfWeek:0,openTime:'01:11',closeTime:'02:22',isClosed:false}]});assert.equal(f.page.find(n=>n.type==='input'&&n.props.value==='01:11'),undefined);
});
test('service creation appends its result without erasing other draft fields through a full reload',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);f.page.click('إضافة خدمة');f.submit('createService');await f.resolve(f.mutations[0],{service:{id:'new-service',titleAr:'خدمة جديدة',status:'active'}});assert.equal(f.loads.length,1);assert.match(f.page.text,/خدمة جديدة/);
});
test('private businesses do not offer unavailable public preview links or count unsaved hours as complete',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);assert.equal(f.page.find(n=>['Link','ActionLink'].includes(n.type)&&n.props.href==='/business-profiles/one'),undefined);
  const progress=f.page.find(n=>n.type==='progress');assert.equal(progress.props.value,33);
});

test('business media consumes file selection once and recovers without reloading other drafts',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);let files=[{name:'fixture.png',type:'image/png',size:8}];
  const input={get files(){return files;},set value(v){if(v==='')files=[];}};
  f.form('uploadMedia').props.onSubmit({preventDefault(){},currentTarget:{elements:{namedItem:()=>input}}});
  f.readers[0].result='data:image/png;base64,AAAA';f.readers[0].onload();await f.page.flush();assert.equal(f.mutations.length,1);assert.equal(files.length,0);
  await f.reject(f.mutations[0]);assert.equal(f.loads.length,1);assert.match(f.page.text,/تعذر تأكيد الرفع/);
  f.form('uploadMedia').props.onSubmit({preventDefault(){},currentTarget:{elements:{namedItem:()=>input}}});assert.equal(f.mutations.length,1);
});
test('changing business during file reading prevents upload to the closed workspace',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);const input={files:[{name:'fixture.png',type:'image/png',size:8}],value:'fixture.png'};
  f.form('uploadMedia').props.onSubmit({preventDefault(){},currentTarget:{elements:{namedItem:()=>input}}});f.changeId('two');await f.resolve(f.loads[1]);
  f.readers[0].result='data:image/png;base64,AAAA';f.readers[0].onload();await f.page.flush();assert.equal(f.mutations.length,0);
});

test('business editor sends explicit empty contact fields when the owner clears them',async()=>{
  const f=fixture();await f.resolve(f.loads[0],{businesses:[{...business('one'),phone:'0123456789',email:'owner@example.test',website:'https://example.test'}]});f.page.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('تعديل المعلومات')).props.onClick();f.page.render();
  for(const type of ['tel','email','url']){const input=f.page.find(n=>n.type==='input'&&n.props.type===type);input.props.onChange({target:{value:''}});f.page.render();}
  f.submit('updateProfile');assert.equal(f.mutations.length,1);for(const field of ['phone','email','website'])assert.equal(f.mutations[0].body[field],'');
});

test('business conflict preserves the draft and only explicit profile reload advances its revision',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);f.page.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('تعديل المعلومات')).props.onClick();f.page.render();
  f.page.find(n=>n.type==='input'&&n.props.value==='نشاط one').props.onChange({target:{value:'مسودة تبويب قديم'}});f.page.render();
  f.submit('updateProfile');assert.equal(f.mutations[0].body.expectedContentRevision,'a'.repeat(64));
  await f.reject(f.mutations[0],Object.assign(new Error('changed'),{statusCode:409}));
  assert.ok(f.page.find(n=>n.type==='input'&&n.props.value==='مسودة تبويب قديم'));assert.equal(f.loads.length,1);
  f.submit('updateProfile');assert.equal(f.mutations.length,1);f.page.click('تحميل معلومات النشاط الحالية');
  await f.resolve(f.loads[1],{businesses:[{...business('one'),name:'النسخة الجديدة',contentRevision:'b'.repeat(64)}]});
  f.submit('updateProfile');assert.equal(f.mutations[1].body.name,'النسخة الجديدة');assert.equal(f.mutations[1].body.expectedContentRevision,'b'.repeat(64));
});
test('business profile reload ignores a response after route change',async()=>{
  const f=fixture();await f.resolve(f.loads[0],{businesses:[{...business('one'),contentRevision:undefined}]});
  f.page.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('تعديل المعلومات')).props.onClick();f.page.render();f.page.click('تحميل معلومات النشاط الحالية');
  f.changeId('two');await f.resolve(f.loads[2]);await f.resolve(f.loads[1],{businesses:[business('one')]});assert.doesNotMatch(f.page.text,/نشاط one/);assert.deepEqual(f.navigations,[]);
});
