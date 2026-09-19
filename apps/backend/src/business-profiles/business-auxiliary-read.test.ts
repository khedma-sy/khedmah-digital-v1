import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NotFoundException,UnauthorizedException} from '@nestjs/common';
import {BusinessProfileService} from './business-profile.service';
const profile={id:'business',ownerUserId:'owner',visibility:'private',moderationStatus:'pending',trustStatus:'pending',status:'active'};
function fixture(changes:Record<string,unknown>={},actor='owner'){
  let current={...profile,...changes};let reads=0;let afterRead:(()=>void)|undefined;let authError:Error|undefined;
  const resource=async()=>{reads++;afterRead?.();return[];};
  const repo={findById:async()=>({...current}),listMediaAssets:resource,listOpeningHours:resource,listBranches:resource,listSocialLinks:resource,findVerificationRequest:resource,listTrustHistory:resource};
  const service=new BusinessProfileService(repo as any,{getCurrentUser:async()=>{if(authError)throw authError;return{id:actor};}} as any,{} as any,{} as any);
  const calls=(cookie?:string)=>[
    ()=>service.getMediaAssets('business','business',undefined,cookie),()=>service.getOpeningHours('business',cookie),()=>service.getBranches('business',cookie),()=>service.getSocialLinks('business',cookie),()=>service.getVerificationStatus('business','business',cookie),()=>service.getTrustHistory('business','business',cookie)
  ];
  return{calls,get reads(){return reads;},set afterRead(fn:()=>void){afterRead=fn;},set authError(value:Error){authError=value;},privatize(){current.visibility='private';}};
}
test('private business auxiliary resources reject anonymous reads before accessing child data',async()=>{
  const f=fixture();for(const read of f.calls())await assert.rejects(read,NotFoundException);assert.equal(f.reads,0);
});
test('private business resources remain available to their owner',async()=>{
  const f=fixture();for(const read of f.calls('khedmah_session=owner-session'))await read();assert.equal(f.reads,6);
});
test('another authenticated account cannot read private business resources',async()=>{
  const f=fixture({},'other');for(const read of f.calls('khedmah_session=other-session'))await assert.rejects(read,NotFoundException);assert.equal(f.reads,0);
});
test('every public eligibility condition also applies to auxiliary resources',async()=>{
  const eligible={visibility:'public',moderationStatus:'approved',trustStatus:'approved',status:'active'};
  const publicFixture=fixture(eligible);for(const read of publicFixture.calls())await read();assert.equal(publicFixture.reads,6);
  for(const change of [{moderationStatus:'pending'},{trustStatus:'suspended'},{status:'suspended'}]){
    const f=fixture({...eligible,...change});for(const read of f.calls())await assert.rejects(read,NotFoundException);assert.equal(f.reads,0);
  }
});
test('expired ownership sessions fail closed while infrastructure errors remain errors',async()=>{
  const expired=fixture();expired.authError=new UnauthorizedException();for(const read of expired.calls('khedmah_session=expired'))await assert.rejects(read,NotFoundException);assert.equal(expired.reads,0);
  const failure=fixture();const offline=new Error('identity unavailable');failure.authError=offline;await assert.rejects(failure.calls('khedmah_session=owner')[0],e=>e===offline);assert.equal(failure.reads,0);
});
test('a profile made private while child data loads does not release those results',async()=>{
  for(let i=0;i<6;i++){
    const f=fixture({visibility:'public',moderationStatus:'approved',trustStatus:'approved'});f.afterRead=()=>f.privatize();await assert.rejects(f.calls()[i],NotFoundException);
  }
});
