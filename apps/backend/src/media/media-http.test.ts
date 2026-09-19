import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Module,UnauthorizedException} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {MediaController} from './media.controller';
import {MediaService} from './media.service';

test('media HTTP routes pass owner cookies and forbid shared caching of protected bytes',async()=>{
  const metadata={storage_key:'fixture',mime_type:'image/png',owner_type:'business_profile',owner_id:'business',visibility:'public'};
  const db={query:async(sql:string)=>sql.includes('FROM media_assets')?[metadata]:sql.includes('AS owner_user_id')?[{owner_user_id:'owner'}]:[]};
  const identity={getCurrentUser:async(token:string)=>{if(token!=='owner')throw new UnauthorizedException();return{id:'owner',email:'owner@example.test'};}};
  const service=new MediaService(db as any,identity as any);
  Object.defineProperty(service,'storage',{value:{read:async()=>({data:Buffer.from('fixture'),mimeType:'image/png'})}});
  @Module({controllers:[MediaController],providers:[{provide:MediaService,useValue:service}]})class FixtureModule{}
  const app=await NestFactory.create(FixtureModule,{logger:false});app.setGlobalPrefix('api/v1');await app.listen(0,'127.0.0.1');
  try{
    const endpoint=`${await app.getUrl()}/api/v1/media/public/asset`;
    const denied=await fetch(endpoint);assert.equal(denied.status,404);await denied.text();
    const response=await fetch(endpoint,{headers:{cookie:'khedmah_session=owner'}});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('vary')??'',/Cookie/);assert.equal(await response.text(),'fixture');
  }finally{await app.close();}
});
