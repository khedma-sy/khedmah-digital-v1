import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BadRequestException} from '@nestjs/common';
import {BusinessProfileService} from './business-profile.service';
import {validateCreateBusinessProfile,validateUpdateBusinessProfile} from './business-profile.validation';
import {validateProfessionalProfileUpsert} from '../professional-profiles/professional-profile.validation';
import {validateUploadMediaRequest} from '../media/media.validation';

function fixture(){
  let profile:any={id:'business',contentRevision:'a'.repeat(64),ownerUserId:'owner',name:'نشاط سابق',descriptionAr:'وصف',descriptionEn:'Description',phone:'0123456789',email:'owner@example.test',website:'https://example.test',addressAr:'عنوان',lat:33.5,lng:36.3,categoryCode:'repairs',cityCode:'damascus',countryCode:'SY'};
  const repository={findById:async()=>profile,updateOwner:async(next:any)=>{profile=next;return profile;}} as any;
  const service=new BusinessProfileService(repository,{getCurrentUser:async()=>({id:'owner'})} as any,{} as any,{assertActiveCategory:async()=>{}} as any);
  return{service,get profile(){return profile;}};
}
for(const field of ['descriptionAr','descriptionEn','phone','email','website','addressAr']){
  test(`business patch explicitly clears ${field} and preserves omitted data`,async()=>{
    for(const value of ['',null,'   ']){const f=fixture();await f.service.update(undefined,'business',{expectedContentRevision:f.profile.contentRevision,[field]:value});assert.equal(f.profile[field],undefined);assert.equal(f.profile.name,'نشاط سابق');assert.equal(f.profile.cityCode,'damascus');if(field!=='phone')assert.equal(f.profile.phone,'0123456789');}
  });
}
test('business patch omits absent optional fields and clears a complete coordinate pair',async()=>{
  const f=fixture();await f.service.update(undefined,'business',{expectedContentRevision:f.profile.contentRevision,name:'اسم جديد'});assert.equal(f.profile.email,'owner@example.test');assert.equal(f.profile.lat,33.5);
  await f.service.update(undefined,'business',{expectedContentRevision:f.profile.contentRevision,lat:null,lng:null});assert.equal(f.profile.lat,undefined);assert.equal(f.profile.lng,undefined);
});
test('business patch rejects incomplete, coerced and nonfinite coordinates',()=>{
  for(const patch of [{lat:33},{lng:36},{lat:91,lng:36},{lat:33,lng:181},{lat:NaN,lng:36},{lat:Infinity,lng:36},{lat:'33',lng:36},{lat:null,lng:36}])assert.throws(()=>validateUpdateBusinessProfile(patch),BadRequestException);
  assert.equal(validateUpdateBusinessProfile({lat:0,lng:0}).lat,0);
});
for(const [name,validate] of [['business create',validateCreateBusinessProfile],['business patch',validateUpdateBusinessProfile],['professional upsert',validateProfessionalProfileUpsert],['media upload',validateUploadMediaRequest]] as const){
  test(`${name} returns a validation error for non-object bodies`,()=>{for(const input of [null,undefined,[],false,'invalid'])assert.throws(()=>validate(input as any),BadRequestException);});
}
