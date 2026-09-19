import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';
const product={id:'p',titleAr:'منتج',descriptionAr:'',price:100,currency:'SYP',categoryCode:'general',availability:'in_stock',imageUrls:[],contentRevision:'a'.repeat(64)};
const image={name:'a.png',type:'image/png',size:1};const asset={id:'image',assetType:'product_image',filename:'a.png',publicUrl:'/a'};
function fixture({brokenStorage=false,storage=new Map()}={}){
  const calls={businesses:[],creates:[],updates:[],uploads:[],submits:[],media:[]},navigations=[];let counter=0;
  const call=(kind,input)=>{const d={...deferred(),input};calls[kind].push(d);return d.promise;};
  const router={push:p=>navigations.push(p),replace:p=>navigations.push(p)};
  const api={businesses:{listMine:()=>call('businesses')},products:{create:data=>call('creates',data),update:(id,data)=>call('updates',{id,data}),submit:id=>call('submits',id)},media:{uploadProduct:(id,data)=>call('uploads',{id,data}),listForOwner:(type,id)=>call('media',{type,id})}};
  const page=clientPage(readSource('apps/frontend/app/store/sell/page.tsx'),{
    'next/navigation':{useRouter:()=>router},'../../../lib/api-client':{api},'../../../lib/use-categories':{useCategories:()=>({categories:[],isLoading:false,error:''})},
    '../../components/category-select-options':{CategorySelectOptions:'CategorySelectOptions'},'../../components/ui-primitives':primitives,'../store.module.css':css
  },{crypto:{randomUUID:()=>`fixture-request-${++counter}-123456`},sessionStorage:{getItem:k=>{if(brokenStorage)throw new Error('denied');return storage.get(k)??null;},setItem:(k,v)=>{if(brokenStorage)throw new Error('denied');storage.set(k,v);},removeItem:k=>storage.delete(k)},
    FileReader:class{readAsDataURL(){this.result='data:image/png;base64,eA==';queueMicrotask(()=>this.onload());}},queueMicrotask});
  const imageInput={files:[image],value:'selected'},form={elements:{namedItem:()=>imageInput}};
  return{page,calls,navigations,imageInput,form,storage,
    async loaded(){calls.businesses.at(-1).resolve({businesses:[{id:'business',name:'نشاطي'}]});await page.flush();page.edit('titleAr','منتج');page.edit('price','100');page.edit('categoryCode','general');},
    async settle(call,value){call.resolve(value);await page.flush();}};
}
test('create double-submit is guarded and failed create retry reuses its request ID',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);f.page.submit(f.form);assert.equal(f.calls.creates.length,1);
  const key=f.calls.creates[0].input.clientRequestId;assert.ok(key);f.calls.creates[0].reject(new Error('response lost'));await f.page.flush();
  f.imageInput.files=[image];f.page.submit(f.form);assert.equal(f.calls.creates[1].input.clientRequestId,key);
});
test('known partial create continues the existing draft without creating another listing',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);await f.settle(f.calls.creates[0],{product});f.calls.uploads[0].reject(new Error('offline'));await f.page.flush();
  await f.settle(f.calls.media[0],[]);f.imageInput.files=[image];f.page.submit(f.form);assert.equal(f.calls.creates.length,1);assert.equal(f.calls.updates[0].input.id,'p');assert.equal(f.calls.updates[0].input.data.expectedContentRevision,product.contentRevision);
});
test('success clears the request marker and navigates only after submission confirms',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);await f.settle(f.calls.creates[0],{product});await f.settle(f.calls.uploads[0],asset);
  assert.equal(f.calls.submits[0].input,'p');assert.deepEqual(f.navigations,[]);await f.settle(f.calls.submits[0],{product});assert.deepEqual(f.navigations,['/store/manage']);assert.equal(f.storage.size,0);
});
test('recovered listing with images goes to explicit review without duplicating its images',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);await f.settle(f.calls.creates[0],{product:{...product,imageUrls:['/a']}});
  assert.equal(f.calls.uploads.length,0);assert.equal(f.calls.submits.length,0);assert.ok(f.page.find(n=>n.props?.href==='/store/manage/p/edit'));f.page.click('بدء منتج جديد');assert.equal(f.storage.size,0);
});
test('a reused key with changed payload exposes a safe resume link without retrying automatically',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);f.calls.creates[0].reject(Object.assign(new Error('existing'),{statusCode:409,code:'PRODUCT_DRAFT_EXISTS',productId:'p'}));await f.page.flush();
  f.page.submit(f.form);assert.equal(f.calls.creates.length,1);assert.ok(f.page.find(n=>n.props?.href==='/store/manage/p/edit'));
});
test('request identity survives reload and unavailable storage still supports in-page retries',async()=>{
  const storage=new Map([['khedmah.product-create.business','previous-request-123456']]);const f=fixture({storage});await f.loaded();f.page.submit(f.form);assert.equal(f.calls.creates[0].input.clientRequestId,'previous-request-123456');
  const g=fixture({brokenStorage:true});await g.loaded();g.page.submit(g.form);const key=g.calls.creates[0].input.clientRequestId;g.calls.creates[0].reject(new Error('offline'));await g.page.flush();g.page.submit(g.form);assert.equal(g.calls.creates[1].input.clientRequestId,key);
});
test('unmount after create stops file uploads, submission and navigation',async()=>{
  const f=fixture();await f.loaded();f.page.submit(f.form);f.page.unmount();f.calls.creates[0].resolve({product});await f.page.flush();assert.equal(f.calls.uploads.length,0);assert.equal(f.calls.submits.length,0);assert.equal(f.page.writesAfterUnmount,0);
});
test('failed seller loading supports retry and never claims the owner has no businesses',async()=>{
  const f=fixture();f.calls.businesses[0].reject(new Error('offline'));await f.page.flush();f.page.click('إعادة المحاولة');assert.equal(f.calls.businesses.length,2);await f.loaded();assert.ok(f.page.find(n=>n.props?.as==='form'));
});
