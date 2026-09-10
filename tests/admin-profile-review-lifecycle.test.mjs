import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, deferred, loadSource, readSource } from './helpers/client-page-harness.mjs';
const revision='2026-09-08T00:00:00.123456Z';
const business={id:'b',revision,name:'نشاط الاختبار',descriptionAr:'وصف النشاط للمراجع',cityCode:'damascus',categoryCode:'repairs',reviewImageUrls:['/api/v1/media/public/business-photo']};
const professional={id:'p',revision,headlineAr:'مهني الاختبار',bioAr:'نبذة المهني للمراجع',cityCode:'damascus',skills:[],reviewImageUrls:['/api/v1/media/public/professional-photo']};
function fixture(kind='business'){
  const loads=[],decisions=[];const call=list=>{const d=deferred();list.push(d);return d.promise;};
  const review=(...args)=>{const p=call(decisions);decisions.at(-1).args=args;return p;};
  const api={moderation:{listPending:()=>call(loads),listReports:async()=>({reports:[]})},adminProducts:{pending:async()=>({products:[]})},businesses:{approveModeration:review,rejectModeration:review},professionals:{approveModeration:review,rejectModeration:review}};
  const page=clientPage(readSource('apps/frontend/app/admin/moderation/page.tsx'),{'../../../lib/api-client':{api},
    '../../../lib/classifieds-client':{adminClassifiedsApi:{pending:async()=>({ads:[]})}},
    '../../../lib/classifieds':{CLASSIFIEDS_ENABLED:false,AD_KIND_LABELS:{},formatAdPrice:()=>''}}, {window:{requestAnimationFrame:fn=>fn()},document:{activeElement:null,addEventListener(){},removeEventListener(){}},HTMLElement:class{}});
  const payload={businesses:kind==='business'?[business]:[],professionals:kind==='professional'?[professional]:[]};
  return{page,loads,decisions,payload,async resolve(c,v=payload){c.resolve(v);await page.flush();},async reject(c,v=new Error('offline')){c.reject(v);await page.flush();}};
}
test('moderation queue ignores an old load after effect replay',async()=>{
  const f=fixture();f.page.replay();await f.resolve(f.loads[1]);await f.resolve(f.loads[0],{businesses:[],professionals:[]});assert.match(f.page.text,/نشاط الاختبار/);
});
test('moderation queue and action stop writing after unmount',async()=>{
  const first=fixture();first.page.unmount();await first.resolve(first.loads[0]);assert.equal(first.page.writesAfterUnmount,0);
  const f=fixture();await f.resolve(f.loads[0]);f.page.click('موافقة');f.page.click('تأكيد القرار');f.page.unmount();await f.resolve(f.decisions[0],{});assert.equal(f.loads.length,1);assert.equal(f.page.writesAfterUnmount,0);
});
test('moderation confirmation is single-flight before React renders disabled state',async()=>{
  const f=fixture();await f.resolve(f.loads[0]);f.page.click('موافقة');const button=f.page.find(n=>n.type==='button'&&n.props.children==='تأكيد القرار');button.props.onClick();button.props.onClick();assert.equal(f.decisions.length,1);
});
for(const kind of ['business','professional']){
  test(`${kind}: approval sends the displayed revision and conflict requires a new decision`,async()=>{
    const f=fixture(kind);await f.resolve(f.loads[0]);assert.match(f.page.text,/للمراجع/);assert.ok(f.page.find(n=>n.type==='a'&&n.props.href===`/api/v1/media/public/${kind}-photo`));f.page.click('موافقة');f.page.click('تأكيد القرار');assert.equal(f.decisions[0].args[1],revision);
    await f.reject(f.decisions[0],Object.assign(new Error('changed'),{statusCode:409}));assert.equal(f.loads.length,2);await f.resolve(f.loads[1]);assert.equal(f.page.find(n=>n.props?.role==='dialog'),undefined);assert.match(f.page.text,/تغير/);assert.equal(f.decisions.length,1);
  });
}
test('profile API clients serialize revisions for approval and rejection',async()=>{
  const calls=[];const {api}=loadSource(readSource('apps/frontend/lib/api-client.ts'),{}, {fetch:async(url,init)=>{calls.push({url,init});return{ok:true,json:async()=>({})};}});
  for(const kind of ['businesses','professionals']){
    await api[kind].approveModeration('id',revision);assert.deepEqual(JSON.parse(calls.at(-1).init.body),{expectedRevision:revision});
    await api[kind].rejectModeration('id','سبب واضح',revision);assert.deepEqual(JSON.parse(calls.at(-1).init.body),{reason:'سبب واضح',expectedRevision:revision});
  }
});
