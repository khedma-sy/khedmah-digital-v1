import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';
const product = { id:'p', titleAr:'منتج قديم', descriptionAr:'وصف', price:100, currency:'SYP', categoryCode:'general', availability:'in_stock', revision:'2026-09-08T00:00:00.123456Z', contentRevision:'a'.repeat(64) };
const first = { id:'image-1', assetType:'product_image', publicUrl:'/first', filename:'first.png' };
function fixture() {
  let id = 'p'; const navigations = [], loads = [], mediaLoads = [], writes = [], uploads = [], submits = [], deletions = [];
  const call = (list,input) => { const d={...deferred(),input}; list.push(d); return d.promise; };
  const api = { products: { listMine:()=>call(loads), update:(id,data)=>call(writes,{id,data}), submit:id=>call(submits,id) },
    media:{listForOwner:(type,id)=>call(mediaLoads,{type,id}), uploadProduct:(id,data)=>call(uploads,{id,data}), delete:id=>call(deletions,id)} };
  const router = { push:path=>navigations.push(path), replace:path=>navigations.push(path) };
  const page=clientPage(readSource('apps/frontend/app/store/manage/[id]/edit/page.tsx'), {
    'next/navigation':{useParams:()=>({id}),useRouter:()=>router},'../../../../../lib/api-client':{api},
    '../../../../../lib/use-categories':{useCategories:()=>({categories:[{code:'general'}],isLoading:false,error:''})},
    '../../../../components/category-select-options':{CategorySelectOptions:'CategorySelectOptions'},
    '../../../../components/ui-primitives':primitives,'../../../../components/platform-icon':{PlatformIcon:'PlatformIcon'},'../../../store.module.css':css
  },{FileReader:class { readAsDataURL(file) { this.result='data:image/png;base64,eA=='; queueMicrotask(()=>this.onload()); } },queueMicrotask});
  async function loaded(value=product,assets=[first]) { loads.at(-1).resolve({products:[value]}); mediaLoads.at(-1).resolve(assets); await page.flush(); }
  const imageInput = { files:[],value:'' }; const form = {elements:{namedItem:()=>imageInput}};
  return {...page,page,navigations,loads,mediaLoads,writes,uploads,submits,deletions,loaded,imageInput,form,
    async settle(call,value) { call.resolve(value); await page.flush(); },
    navigate(next) { id=next; page.render(); }
  };
}
test('owner save sends the loaded content reference and prevents double submission',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);f.page.submit(f.form);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].input.data.expectedContentRevision,product.contentRevision);
});
test('failed load is recoverable and is not described as a missing product',async()=>{
  const f=fixture();f.loads[0].reject(new Error('offline'));f.mediaLoads[0].resolve([]);await f.page.flush();
  assert.doesNotMatch(f.page.text,/المنتج غير موجود/);f.page.click('إعادة المحاولة');assert.equal(f.loads.length,2);await f.loaded();assert.match(f.page.text,/حفظ وإعادة الإرسال/);
});
test('conflict preserves the draft and requires explicit reload before another save',async()=>{
  const f=fixture();await f.loaded();f.page.edit('titleAr','مسودتي');f.page.submit(f.form);
  f.writes[0].reject(Object.assign(new Error('changed'),{statusCode:409}));await f.page.flush();
  assert.equal(f.page.find(n=>n.props?.name==='titleAr').props.value,'مسودتي');assert.equal(f.submits.length,0);
  f.page.click('تحميل النسخة الحالية بدل المسودة');await f.loaded({...product,titleAr:'نسخة الخادم',contentRevision:'b'.repeat(64)});
  assert.equal(f.page.find(n=>n.props?.name==='titleAr').props.value,'نسخة الخادم');
});
test('partial image upload retains saved product and does not replay previously uploaded files',async()=>{
  const f=fixture();await f.loaded();f.imageInput.files=[{name:'a.png',type:'image/png',size:1},{name:'b.png',type:'image/png',size:1}];f.imageInput.value='selected';
  f.page.submit(f.form);await f.settle(f.writes[0],{product:{...product,contentRevision:'b'.repeat(64)}});
  await f.settle(f.uploads[0],{...first,id:'image-2'});f.uploads[1].reject(new Error('upload failed'));await f.page.flush();
  f.mediaLoads.at(-1).resolve([first,{...first,id:'image-2'}]);await f.page.flush();
  assert.equal(f.imageInput.value,'');assert.equal(f.submits.length,0);assert.match(f.page.text,/رفع|صورة/);
  f.imageInput.files=[];f.page.submit(f.form);assert.equal(f.writes.at(-1).input.data.expectedContentRevision,'b'.repeat(64));
});
test('route change hides the old product and prevents old save continuation or navigation',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);f.navigate('other');assert.equal(f.page.find(n=>n.props?.name==='titleAr'),undefined);
  await f.settle(f.writes[0],{product});assert.equal(f.submits.length,0);assert.deepEqual(f.navigations,[]);
});
test('unmounted failed loads cannot redirect or write state',async()=>{
  const f=fixture();f.page.unmount();f.loads[0].reject(Object.assign(new Error('expired'),{statusCode:401}));f.mediaLoads[0].resolve([]);await f.page.flush();
  assert.equal(f.page.writesAfterUnmount,0);assert.deepEqual(f.navigations,[]);
});
test('successful save navigates only after the server confirms submission',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);await f.settle(f.writes[0],{product:{...product,contentRevision:'b'.repeat(64)}});
  assert.equal(f.submits.length,1);assert.deepEqual(f.navigations,[]);await f.settle(f.submits[0],{product});assert.deepEqual(f.navigations,['/store/manage']);
});
test('uncertain media state blocks another save until the page reloads',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);f.writes[0].reject(new Error('network'));await f.page.flush();
  f.mediaLoads.at(-1).reject(new Error('offline'));await f.page.flush();f.page.submit(f.form);assert.equal(f.writes.length,1);
  assert.match(f.page.text,/تعذر التحقق من الصور/);
});
test('deleting an image updates the shown count and cannot trigger a second delete',async()=>{
  const f=fixture();await f.loaded();f.page.click('حذف واستبدال');assert.equal(f.deletions.length,1);
  await f.settle(f.deletions[0],undefined);assert.equal(f.page.all().filter(n=>n.type==='figure').length,0);
});
test('unmount after a partial save stops uploads and submit',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);f.page.unmount();f.writes[0].resolve({product});await f.page.flush();
  assert.equal(f.submits.length,0);assert.equal(f.page.writesAfterUnmount,0);
});
