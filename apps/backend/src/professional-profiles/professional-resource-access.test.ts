import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { ProfessionalProfileService } from './professional-profile.service';
import { ProfessionalProfilesController } from './professional-profiles.controller';

function fixture() {
  let owner='owner';let actor='owner';let sessionError:Error|undefined;let reads=0;let visibility='private';let release:(()=>void)|undefined;
  const stored={status:'pending',requesterId:'internal',notes:'internal',createdAt:'2026-09-08',updatedAt:'2026-09-08'};
  const read=async()=>{reads++;if(release===undefined) return stored;await new Promise<void>(resolve=>{release=resolve;});return stored;};
  const repository={findById:async()=>({id:'profile',userId:owner}),findContactEligibility:async()=>({visibility,moderationStatus:'approved',lifecycleStatus:'active'}),listMediaAssets:read,findVerificationRequest:read,listTrustHistory:read};
  const service=new ProfessionalProfileService(repository as any,{getCurrentUser:async()=>{if(sessionError)throw sessionError;return{id:actor};}} as any,{} as any);
  return{service,get reads(){return reads;},setActor(v:string){actor=v;},setOwner(v:string){owner=v;},setVisibility(v:string){visibility=v;},setSessionError(v:Error){sessionError=v;},pause(){release=()=>{};},resume(){release!();}};
}
const resources=[['media',(s:ProfessionalProfileService,c?:string)=>s.getMediaAssets('profile',undefined,c)],['verification',(s:ProfessionalProfileService,c?:string)=>s.getVerificationStatus('profile',c)],['history',(s:ProfessionalProfileService,c?:string)=>s.getTrustHistory('profile',c)]] as const;
for(const [name,read] of resources) {
  test(`${name}: private owner can read but guests and other accounts cannot query children`,async()=>{
    const f=fixture();await read(f.service,'khedmah_session=valid');assert.equal(f.reads,1);
    for(const cookie of [undefined,'unrelated=x','khedmah_session=%broken'])await assert.rejects(()=>read(f.service,cookie),NotFoundException);
    f.setActor('other');await assert.rejects(()=>read(f.service,'khedmah_session=valid'),NotFoundException);assert.equal(f.reads,1);
  });
  test(`${name}: a public resource becoming private during load is withheld`,async()=>{
    const f=fixture();f.setVisibility('public');f.pause();const pending=read(f.service);for(let i=0;i<8;i++)await Promise.resolve();assert.equal(f.reads,1);f.setVisibility('private');f.resume();await assert.rejects(()=>pending,NotFoundException);
  });
  test(`${name}: ownership is checked again before releasing private data`,async()=>{
    const f=fixture();f.pause();const pending=read(f.service,'khedmah_session=valid');for(let i=0;i<8;i++)await Promise.resolve();assert.equal(f.reads,1);f.setOwner('other');f.resume();await assert.rejects(()=>pending,NotFoundException);
  });
}
test('private professional session errors fail closed without disguising infrastructure errors',async()=>{
  const f=fixture();f.setSessionError(new UnauthorizedException());await assert.rejects(()=>f.service.getVerificationStatus('profile','khedmah_session=invalid'),NotFoundException);
  const unavailable=new Error('identity unavailable');f.setSessionError(unavailable);await assert.rejects(()=>f.service.getVerificationStatus('profile','khedmah_session=valid'),error=>error===unavailable);assert.equal(f.reads,0);
});
test('owner verification projection and cookie-varying endpoints protect internal data and caches',async()=>{
  const f=fixture();const result=await f.service.getVerificationStatus('profile','khedmah_session=valid');assert.deepEqual(Object.keys(result!).sort(),['createdAt','status','updatedAt']);
  for(const method of ['getMedia','getVerificationStatus','getTrustHistory'] as const){const headers=Reflect.getMetadata(HEADERS_METADATA,ProfessionalProfilesController.prototype[method]);assert.ok(headers.some((h:any)=>h.name==='Cache-Control'&&h.value==='private, no-store'));assert.ok(headers.some((h:any)=>h.name==='Vary'&&h.value==='Cookie'));}
});
