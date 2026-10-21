import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ForbiddenException,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {HEADERS_METADATA} from '@nestjs/common/constants';
import {MediaController} from './media.controller';
import {MediaService} from './media.service';
const metadata={id:'asset',owner_user_id:'owner',owner_type:'business_profile',owner_id:'business',visibility:'public',storage_key:'fixture-object',mime_type:'image/png',asset_type:'gallery'};
function fixture(overrides:Partial<typeof metadata>={}){
  const currentMetadata={...metadata,...overrides};
  let parentPublic=false;let pendingContent=false;let pendingVerification=false;let actor='owner';let storageReads=0;let revokeDuringRead=false;let revokePendingDuringRead=false;const authorizationCalls:string[][]=[];
  const db={query:async(sql:string)=>{
    if(sql.includes('FROM media_assets'))return[{...currentMetadata,filename:'fixture.png',size_bytes:8,sort_order:0,created_at:new Date(),updated_at:new Date()}];
    if(sql.includes('FROM verification_requests'))return pendingVerification?[{allowed:true}]:[];
    if(sql.includes('AS owner_user_id'))return[{owner_user_id:'owner'}];
    if(sql.includes("moderation_status='pending'"))return pendingContent?[{allowed:true}]:[];
    if(sql.includes('FROM business_profiles'))return parentPublic?[{allowed:true}]:[];
    return[];
  }};
  const identity={getCurrentUser:async(token?:string)=>{if(!token)throw new UnauthorizedException();return{id:actor,email:`${actor}@example.test`};}};
  const rbac={
    assertAny:(_email:string,permissions:string[])=>{authorizationCalls.push(permissions);if(!['reviewer','security'].includes(actor))throw new ForbiddenException();},
    assert:()=>{if(actor!=='security')throw new ForbiddenException();}
  };
  const service=new MediaService(db as any,identity as any,rbac as any);
  Object.defineProperty(service,'storage',{value:{read:async()=>{storageReads++;if(revokeDuringRead)parentPublic=false;if(revokePendingDuringRead)pendingVerification=false;return{data:Buffer.from('fixture'),mimeType:'image/png'};}}});
  return{service,get storageReads(){return storageReads;},authorizationCalls,publish(){parentPublic=true;},allowPendingContent(){pendingContent=true;},allowPendingVerification(){pendingVerification=true;},set actor(value:string){actor=value;},revokeDuringRead(){revokeDuringRead=true;},revokePendingDuringRead(){revokePendingDuringRead=true;}};
}
test('a public-marked asset under a private business is not anonymously readable',async()=>{
  const f=fixture();await assert.rejects(()=>f.service.readPublic('asset'),NotFoundException);assert.equal(f.storageReads,0);
});
test('media ownership listing rejects another account even when its assets are public-marked',async()=>{
  const f=fixture();f.actor='other';await assert.rejects(()=>f.service.listForOwner('khedmah_session=other','business_profile','business'),ForbiddenException);
});
test('owner media metadata is private and never shared-cached',()=>{
  const headers=Reflect.getMetadata(HEADERS_METADATA,MediaController.prototype.listForOwner);
  assert.ok(headers.some((header:any)=>header.name==='Cache-Control'&&header.value==='private, no-store'));
  assert.ok(headers.some((header:any)=>header.name==='Vary'&&header.value==='Cookie'));
});
test('owner and authorized reviewer can inspect draft images while another account cannot',async()=>{
  const f=fixture();await f.service.readPublic('asset','khedmah_session=owner');f.actor='reviewer';f.allowPendingContent();await f.service.readPublic('asset','khedmah_session=reviewer');
  f.actor='other';await assert.rejects(()=>f.service.readPublic('asset','khedmah_session=other'),NotFoundException);assert.equal(f.storageReads,2);
  assert.deepEqual(f.authorizationCalls,[['security.manage','content.approvals.approve'],['security.manage','content.approvals.approve'],['security.manage','content.approvals.approve']]);
});
test('bounded content reviewer cannot inspect an asset outside the pending queue while security retains broad review access',async()=>{
  const f=fixture();f.actor='reviewer';await assert.rejects(()=>f.service.readPublic('asset','khedmah_session=reviewer'),NotFoundException);assert.equal(f.storageReads,0);
  f.actor='security';await f.service.readPublic('asset','khedmah_session=security');assert.equal(f.storageReads,1);
});
test('public parent images remain anonymous and revocation during storage read blocks the response',async()=>{
  const f=fixture();f.publish();await f.service.readPublic('asset');f.revokeDuringRead();await assert.rejects(()=>f.service.readPublic('asset'),NotFoundException);
});
test('trust reviewer reads private verification evidence only while the latest request is pending',async()=>{
  const f=fixture({visibility:'private',asset_type:'business_verification_evidence'});f.actor='reviewer';
  await assert.rejects(()=>f.service.readPublic('asset','khedmah_session=reviewer'),NotFoundException);assert.equal(f.storageReads,0);
  f.allowPendingVerification();await f.service.readPublic('asset','khedmah_session=reviewer');assert.equal(f.storageReads,1);
  assert.deepEqual(f.authorizationCalls,[
    ['security.manage','trust.approvals.approve'],
    ['security.manage','trust.approvals.approve'],
    ['security.manage','trust.approvals.approve']
  ]);
});
test('verification evidence access is rechecked after storage read',async()=>{
  const f=fixture({visibility:'private',asset_type:'business_verification_evidence'});f.actor='reviewer';f.allowPendingVerification();f.revokePendingDuringRead();
  await assert.rejects(()=>f.service.readPublic('asset','khedmah_session=reviewer'),NotFoundException);assert.equal(f.storageReads,1);
});
