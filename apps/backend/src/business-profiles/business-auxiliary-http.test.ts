import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Module,UnauthorizedException} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {BusinessProfilesController} from './business-profiles.controller';
import {BusinessProfileService} from './business-profile.service';

test('business auxiliary HTTP routes enforce ownership and preserve public projections',async(t)=>{
  let visibility='private';let reads=0;
  const profile={id:'fixture',ownerUserId:'owner',visibility:'private',moderationStatus:'approved',trustStatus:'approved',status:'active'};
  const resource=async()=>{reads++;return[{id:'child-fixture',oldStatus:'pending',newStatus:'approved',changedBy:'internal-reviewer',createdAt:'2026-09-08T00:00:00Z'}];};
  const repo={findById:async()=>({...profile,visibility}),listMediaAssets:resource,listOpeningHours:resource,listBranches:resource,listSocialLinks:resource,listTrustHistory:resource,
    findVerificationRequest:async()=>{reads++;return{status:'pending',requesterId:'internal-owner',notes:'internal-note',createdAt:'2026-09-08T00:00:00Z',updatedAt:'2026-09-08T00:00:00Z'};}};
  const identity={getCurrentUser:async(token?:string)=>{if(token==='owner-session')return{id:'owner'};if(token==='other-session')return{id:'other'};throw new UnauthorizedException();}};
  const service=new BusinessProfileService(repo as any,identity as any,{} as any,{} as any);
  @Module({controllers:[BusinessProfilesController],providers:[{provide:BusinessProfileService,useValue:service}]})
  class FixtureModule{}
  const app=await NestFactory.create(FixtureModule,{logger:false});app.setGlobalPrefix('api/v1');
  await app.listen(0,'127.0.0.1');const origin=await app.getUrl();
  const paths=['media','opening-hours','branches','social-links','verification-status','trust-history'];
  try{
    await t.test('anonymous and another account cannot retrieve any private child route',async()=>{
      for(const cookie of [undefined,'khedmah_session=other-session'])for(const path of paths){
        const response=await fetch(`${origin}/api/v1/businesses/fixture/${path}`,{headers:cookie?{cookie}:{}});
        assert.equal(response.status,404,path);assert.doesNotMatch(await response.text(),/child-fixture|internal-/);
      }
      assert.equal(reads,0);
    });
    await t.test('the owner cookie reaches every existing route and allows its private data',async()=>{
      for(const path of paths){const response=await fetch(`${origin}/api/v1/businesses/fixture/${path}`,{headers:{cookie:'khedmah_session=owner-session'}});assert.equal(response.status,200,path);await response.text();}
      assert.equal(reads,6);
    });
    await t.test('eligible public routes remain anonymous and audit projection omits internal fields',async()=>{
      visibility='public';
      for(const path of paths){const response=await fetch(`${origin}/api/v1/businesses/fixture/${path}`);assert.equal(response.status,200,path);const body=await response.text();if(['verification-status','trust-history'].includes(path))assert.doesNotMatch(body,/requesterId|changedBy|notes|internal-/);}
    });
    await t.test('malformed session encoding cannot turn a private read into a server error',async()=>{
      visibility='private';const response=await fetch(`${origin}/api/v1/businesses/fixture/media`,{headers:{cookie:'khedmah_session=%E0%A4%A'}});assert.equal(response.status,404);await response.text();
    });
  }finally{await app.close();}
});
