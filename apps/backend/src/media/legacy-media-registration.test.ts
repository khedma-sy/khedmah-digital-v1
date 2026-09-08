import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BadRequestException,ForbiddenException} from '@nestjs/common';
import {BusinessProfileService} from '../business-profiles/business-profile.service';
import {ProfessionalProfileService} from '../professional-profiles/professional-profile.service';

for(const kind of ['business','professional'] as const){
  test(`${kind}: legacy registration cannot introduce unowned storage objects`,async()=>{
    let writes=0;const owned={id:'owned',url:'/api/v1/media/public/owned',storagePath:'media/owned.png',assetType:'gallery',createdAt:'2026-09-08T00:00:00Z'};
    const repository={findById:async()=>({id:'profile',ownerUserId:'owner',userId:'owner'}),listMediaAssets:async()=>[owned],saveMediaAsset:async()=>{writes++;}} as any;
    const identity={getCurrentUser:async()=>({id:'owner'})} as any;
    const service=kind==='business'?new BusinessProfileService(repository,identity,{} as any,{} as any):new ProfessionalProfileService(repository,identity,{} as any);
    await assert.rejects(()=>service.addMediaAsset(undefined,'profile',{...owned,storagePath:'private/another-account.png'} as any),BadRequestException);
    await assert.rejects(()=>service.addMediaAsset(undefined,'profile',{...owned,url:'https://unowned.example/image.png'} as any),BadRequestException);
    assert.deepEqual(await service.addMediaAsset(undefined,'profile',owned as any),owned);assert.equal(writes,0);
  });
  test(`${kind}: legacy registration checks the profile owner before looking up images`,async()=>{
    let reads=0;const repository={findById:async()=>({id:'profile',ownerUserId:'someone-else',userId:'someone-else'}),listMediaAssets:async()=>{reads++;return[];}} as any;
    const identity={getCurrentUser:async()=>({id:'owner'})} as any;
    const service=kind==='business'?new BusinessProfileService(repository,identity,{} as any,{} as any):new ProfessionalProfileService(repository,identity,{} as any);
    await assert.rejects(()=>service.addMediaAsset(undefined,'profile',{} as any),ForbiddenException);assert.equal(reads,0);
  });
}
