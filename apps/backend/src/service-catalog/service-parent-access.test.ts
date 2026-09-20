import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BadRequestException,NotFoundException} from '@nestjs/common';
import {ServiceCatalogService} from './service-catalog.service';
function fixture(kind:'business'|'professional'='business'){
  let parent:any={id:'parent',ownerUserId:'owner',userId:'owner',visibility:'private',moderationStatus:'pending',trustStatus:'pending',status:'active',lifecycleStatus:'created'};
  let actor='owner';let writes=0;const item:any={id:'service',ownerType:kind,ownerId:'parent',status:'active',titleAr:'خدمة خاصة'};
  const repository={findById:async()=>({...item}),listForOwner:async()=>[{...item}]} as any;
  const owners={findById:async()=>({...parent}),findContactEligibility:async()=>({...parent}),listMediaAssets:async()=>[],saveMediaAsset:async()=>{writes++;}} as any;
  const identity={getSession:async(token:string)=>token?{id:actor}:undefined,getCurrentUser:async()=>({id:actor})} as any;
  const service=new ServiceCatalogService(repository,identity,owners,owners,{} as any);
  return{service,item,get parent(){return parent;},set parent(value){parent=value;},set actor(value:string){actor=value;},get writes(){return writes;}};
}
for(const kind of ['business','professional'] as const){
 test(`${kind}: active services of private parents are hidden from anonymous and other accounts`,async()=>{
   const f=fixture(kind);await assert.rejects(()=>f.service.getOne(undefined,'service'),NotFoundException);await assert.rejects(()=>f.service.listForOwner(undefined,'parent',{ownerType:kind}),NotFoundException);
   f.actor='other';await assert.rejects(()=>f.service.getOne('khedmah_session=other','service'),NotFoundException);await assert.rejects(()=>f.service.getMediaAssets('service',undefined,'khedmah_session=other'),NotFoundException);
 });
 test(`${kind}: current owner can inspect inactive services and the eligible public parent permits active reads`,async()=>{
   const f=fixture(kind);f.item.status='inactive';assert.equal((await f.service.getOne('khedmah_session=owner','service')).id,'service');assert.equal((await f.service.listForOwner('khedmah_session=owner','parent',{ownerType:kind})).length,1);
   f.parent={...f.parent,visibility:'public',moderationStatus:'approved',trustStatus:'approved',lifecycleStatus:'active'};await assert.rejects(()=>f.service.getOne(undefined,'service'),NotFoundException);assert.equal((await f.service.listForOwner(undefined,'parent',{ownerType:kind})).length,0);
   f.item.status='active';assert.equal((await f.service.getOne(undefined,'service')).id,'service');
 });
 test(`${kind}: legacy service image registration rejects unregistered storage references`,async()=>{
   const f=fixture(kind);await assert.rejects(()=>f.service.addMediaAsset(undefined,'service',{entityId:'other',url:'https://unowned.example/image',storagePath:'private/object',assetType:'service_image'} as any),BadRequestException);assert.equal(f.writes,0);
 });
}
