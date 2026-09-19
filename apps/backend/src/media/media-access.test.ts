import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ForbiddenException,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {MediaService} from './media.service';
const metadata={id:'asset',owner_user_id:'owner',owner_type:'business_profile',owner_id:'business',visibility:'public',storage_key:'fixture-object',mime_type:'image/png'};
function fixture(){
  let parentPublic=false;let actor='owner';let storageReads=0;let revokeDuringRead=false;
  const db={query:async(sql:string)=>{
    if(sql.includes('FROM media_assets'))return[{...metadata,filename:'fixture.png',size_bytes:8,sort_order:0,created_at:new Date(),updated_at:new Date()}];
    if(sql.includes('AS owner_user_id'))return[{owner_user_id:'owner'}];
    if(sql.includes('FROM business_profiles'))return parentPublic?[{allowed:true}]:[];
    return[];
  }};
  const identity={getCurrentUser:async(token?:string)=>{if(!token)throw new UnauthorizedException();return{id:actor,email:`${actor}@example.test`};}};
  const rbac={assert:()=>{if(actor!=='reviewer')throw new ForbiddenException();}};
  const service=new MediaService(db as any,identity as any,rbac as any);
  Object.defineProperty(service,'storage',{value:{read:async()=>{storageReads++;if(revokeDuringRead)parentPublic=false;return{data:Buffer.from('fixture'),mimeType:'image/png'};}}});
  return{service,get storageReads(){return storageReads;},publish(){parentPublic=true;},set actor(value:string){actor=value;},revokeDuringRead(){revokeDuringRead=true;}};
}
test('a public-marked asset under a private business is not anonymously readable',async()=>{
  const f=fixture();await assert.rejects(()=>f.service.readPublic('asset'),NotFoundException);assert.equal(f.storageReads,0);
});
test('media ownership listing rejects another account even when its assets are public-marked',async()=>{
  const f=fixture();f.actor='other';await assert.rejects(()=>f.service.listForOwner('khedmah_session=other','business_profile','business'),ForbiddenException);
});
test('owner and authorized reviewer can inspect draft images while another account cannot',async()=>{
  const f=fixture();await f.service.readPublic('asset','khedmah_session=owner');f.actor='reviewer';await f.service.readPublic('asset','khedmah_session=reviewer');
  f.actor='other';await assert.rejects(()=>f.service.readPublic('asset','khedmah_session=other'),NotFoundException);assert.equal(f.storageReads,2);
});
test('public parent images remain anonymous and revocation during storage read blocks the response',async()=>{
  const f=fixture();f.publish();await f.service.readPublic('asset');f.revokeDuringRead();await assert.rejects(()=>f.service.readPublic('asset'),NotFoundException);
});
