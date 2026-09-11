import assert from 'node:assert/strict';
import test from 'node:test';
import {clientPage,css,deferred,primitives,readSource} from './helpers/client-page-harness.mjs';
function fixture(kind) {
  let id='first';const calls=[];
  const request=(section)=>{const d={...deferred(),section,id};calls.push(d);return d.promise;};
  const profile={id,headlineAr:'المهني الحالي',name:'النشاط الحالي',countryCode:'SY',cityCode:'damascus',availability:'available',skills:[],visibility:'public',trustStatus:'approved'};
  const provider={getProfile:()=>request('profile'),getPublic:()=>request('profile'),getMedia:()=>request('media'),getVerificationStatus:()=>request('verification'),getOpeningHours:()=>request('hours'),getBranches:()=>request('branches'),getSocialLinks:()=>request('links')};
  const api={businesses:provider,professionals:provider,services:{listForOwner:()=>request('services')}};
  const page=clientPage(readSource(`apps/frontend/app/${kind}-profiles/[id]/page.tsx`),{
    'next/link':{default:'Link'},'next/navigation':{useParams:()=>({id}),useRouter:()=>({back(){}})},
    '../../../lib/api-client':{api},'../../../lib/use-syrian-cities':{useSyrianCities:()=>({cities:[]}),cityLabel:()=> 'دمشق'},'../../../lib/use-categories':{useCategories:()=>({categories:[]})},
    '../../../components/contact-inquiry-form':{ContactInquiryForm:'ContactInquiryForm'},'../../../components/provider-report-form':{ProviderReportForm:'ProviderReportForm'},'../../components/ui-primitives':primitives,'../../components/platform-icon':{PlatformIcon:'PlatformIcon'},'./provider-qr-action':{ProviderQrAction:'ProviderQrAction'},'./public-profile.module.css':{default:css},'./professional-profile.module.css':{default:css}
  });
  const empty={profile:{[kind==='business'?'business':'professional']:profile},services:{services:[]},media:{assets:[]},verification:{status:null},hours:{hours:[]},branches:{branches:[]},links:{links:[]}};
  const finish=async(batch=calls.slice(),fail=[],overrides={})=>{for(const c of batch){if(fail.includes(c.section))c.reject(new Error('offline'));else c.resolve(overrides[c.section]??empty[c.section]);}await page.flush();};
  return {page,calls,profile,finish,navigate(value){id=value;page.render();}};
}
for(const kind of ['business','professional']){
 test(`${kind}: failed details retain the public profile, identify missing sections and recover explicitly`,async()=>{
  const f=fixture(kind);await f.finish(undefined,['services','media','verification']);assert.ok(f.page.find(n=>n.type==='h1'));assert.match(f.page.text,/تعذر تحميل:/);for(const label of ['الخدمات','الصور','حالة التوثيق'])assert.ok(f.page.text.includes(label));
  assert.ok(!f.page.find(n=>n.props?.title==='لم تُضف خدمات بعد'));assert.doesNotMatch(f.page.text,/تم توثيق|لم يضف مقدم النشاط/);
  const count=f.calls.length;f.page.click('إعادة تحميل التفاصيل');assert.equal(f.calls.length,2*count);await f.finish(f.calls.slice(count),[],{services:{services:[{id:'service',status:'active',titleAr:'خدمة مستعادة',priceType:'fixed'}]}});assert.match(f.page.text,/خدمة مستعادة/);assert.doesNotMatch(f.page.text,/تعذر تحميل:/);
 });
 test(`${kind}: successful empty responses do not show a network warning`,async()=>{
  const f=fixture(kind);await f.finish();assert.doesNotMatch(f.page.text,/تعذر تحميل:/);if(kind==='professional')assert.ok(f.page.find(n=>n.props?.title==='لم تُضف خدمات بعد'));else assert.match(f.page.text,/لم يضف مقدم النشاط/);
 });
 test(`${kind}: a missing parent does not expose loaded details and has an explicit retry`,async()=>{
  const f=fixture(kind);await f.finish(undefined,['profile'],{services:{services:[{id:'secret',status:'active',titleAr:'لا يظهر',priceType:'fixed'}]}});assert.doesNotMatch(f.page.text,/لا يظهر/);assert.ok(f.page.find(n=>n.type==='EmptyState'));const count=f.calls.length;f.page.click('إعادة المحاولة');await f.finish(f.calls.slice(count));assert.ok(f.page.find(n=>n.type==='h1'));
 });
 test(`${kind}: late previous-profile details cannot overwrite the new profile`,async()=>{
  const f=fixture(kind),old=f.calls.slice();f.navigate('second');const newer=f.calls.slice(old.length);await f.finish(newer,[],{profile:{[kind==='business'?'business':'professional']:{...f.profile,id:'second',name:'ملف ثان',headlineAr:'ملف ثان'}}});await f.finish(old,['services','media']);assert.match(f.page.text,/ملف ثان/);assert.doesNotMatch(f.page.text,/تعذر تحميل:/);
 });
 test(`${kind}: detail responses after unmount never update page state`,async()=>{
  const f=fixture(kind);f.page.unmount();await f.finish(undefined,['services']);assert.equal(f.page.writesAfterUnmount,0);
 });
}
test('business: unavailable opening hours and links never claim the owner provided none',async()=>{
 const f=fixture('business');await f.finish(undefined,['hours','links','branches']);assert.match(f.page.text,/ساعات العمل/);assert.match(f.page.text,/روابط التواصل/);assert.match(f.page.text,/الفروع/);assert.doesNotMatch(f.page.text,/لم يضف مقدم النشاط/);
});
test('business: a loaded social contact suppresses the no-contact fallback',async()=>{
 const f=fixture('business');await f.finish(undefined,[],{links:{links:[{id:'social',platform:'website',url:'https://fixture.example.test'}]}});assert.doesNotMatch(f.page.text,/لم يضف مقدم النشاط/);
});
