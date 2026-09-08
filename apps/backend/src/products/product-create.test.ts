import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ProductService } from './product.service';
import { validateProductWrite } from './product.validation';
const input = { businessProfileId:'business',titleAr:'منتج جديد',descriptionAr:'وصف',price:100,currency:'SYP',categoryCode:'general',availability:'in_stock',clientRequestId:'fixture-request-123456' };
function fixture() {
  const records = new Map<string,any>(); let actor='owner'; let inserts=0;
  const repository = { findById:async(id:string)=>records.get(id), insert:async(product:any)=>{
    inserts++;if (!records.has(product.id))records.set(product.id,{...product,revision:'2026-09-08T00:00:00.000001Z',contentRevision:'a'.repeat(64)});
    return records.get(product.id);
  }};
  const service = new ProductService(repository as any,{findById:async()=>({id:'business',ownerUserId:actor})} as any,{assertActiveCategory:async()=>{}} as any,{getCurrentUser:async()=>({id:actor})} as any,{} as any);
  return {service,records,get inserts(){return inserts;},set actor(value:string){actor=value;}};
}
test('retrying a create with the same owner key returns one existing draft',async()=>{
  const f=fixture();const first=await f.service.create(undefined,input);const retry=await f.service.create(undefined,input);
  assert.equal(first.id,retry.id);assert.equal(f.records.size,1);assert.equal(f.inserts,1);
});
test('concurrent creation requests with the same key cannot create two listings',async()=>{
  const f=fixture();const [a,b]=await Promise.all([f.service.create(undefined,input),f.service.create(undefined,input)]);
  assert.equal(a.id,b.id);assert.equal(f.records.size,1);
});
test('reusing a key with changed data points only to the owner’s existing draft',async()=>{
  const f=fixture();const saved=await f.service.create(undefined,input);
  await assert.rejects(()=>f.service.create(undefined,{...input,titleAr:'بيانات مختلفة'}),error=>{
    assert.ok(error instanceof ConflictException);assert.equal((error.getResponse() as any).productId,saved.id);return true;
  });assert.equal(f.records.size,1);
});
test('the same client key is scoped separately for each account',async()=>{
  const f=fixture();const first=await f.service.create(undefined,input);f.actor='another_owner';const second=await f.service.create(undefined,input);assert.notEqual(first.id,second.id);
});
test('legacy creates remain separate while malformed request keys fail explicitly',async()=>{
  const f=fixture();const {clientRequestId,...legacy}=input;
  const first=await f.service.create(undefined,legacy);const second=await f.service.create(undefined,legacy);assert.notEqual(first.id,second.id);
  for(const key of ['',[],{},'short'])await assert.rejects(()=>f.service.create(undefined,{...input,clientRequestId:key}),BadRequestException);
});
test('replay never returns a listing belonging to another account',async()=>{
  const f=fixture();const saved=await f.service.create(undefined,input);f.records.set(saved.id,{...saved,ownerUserId:'other'});
  await assert.rejects(()=>f.service.create(undefined,input),ForbiddenException);
});
test('price validation rejects coercions and values that would be rounded on storage',()=>{
  for(const price of [true,[],{},'0x10',1.234,'12.345',NaN,Infinity])assert.throws(()=>validateProductWrite({...input,price}),BadRequestException);
  for(const price of [0.01,1.1,'12.50',100])assert.equal(validateProductWrite({...input,price}).price,Number(price));
});
test('malformed request bodies fail with a validation error rather than an internal error',()=>{
  for(const value of [null,undefined,[],42])assert.throws(()=>validateProductWrite(value as any),BadRequestException);
});
