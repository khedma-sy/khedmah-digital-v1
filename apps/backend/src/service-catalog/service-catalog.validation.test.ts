import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  validateCreateServiceRequest, validateUpdateServiceRequest,
  validateServiceSearchRequest, validateOwnerServicesRequest
} from './service-catalog.validation';

const badRequest = (error: unknown): boolean => error instanceof BadRequestException && error.getStatus() === 400;
const validCreate = { titleAr:'خدمة اختبار',categoryCode:'test',ownerType:'business' as const,ownerId:'business_test',ownerUserId:'owner_test' };

for (const [name,validate] of [
  ['create',validateCreateServiceRequest],['update',validateUpdateServiceRequest],
  ['search',validateServiceSearchRequest],['owner list',validateOwnerServicesRequest]
] as const) {
  test(`service ${name}: malformed request containers return 400, not an internal error`,() => {
    for (const body of [undefined,null,false,true,0,42,'service',[],[validCreate]]) {
      assert.throws(() => validate(body as any),badRequest);
    }
  });
}

test('service pagination accepts whole decimal pages and preserves requested context',() => {
  for (const [input,expected] of [[undefined,1],[1,1],['1',1],['02',2],[3,3],['57',57]] as const) {
    const result = validateServiceSearchRequest({page:input,q:' صيانة ',cityCode:'damascus',categoryCode:'test'});
    assert.equal(result.page,expected);
    assert.equal(result.q,'صيانة'); assert.equal(result.cityCode,'damascus'); assert.equal(result.categoryCode,'test');
  }
});

test('service pagination rejects numeric prefixes, unsafe values and unsafe offsets',() => {
  for (const page of ['', ' ', '2abc','2.5','1e3','0x10','+2','-1','Infinity','NaN','9007199254740993',
    0,-1,1.5,NaN,Infinity,-Infinity,null,true,[],{},Number.MAX_SAFE_INTEGER,String(Number.MAX_SAFE_INTEGER)]) {
    assert.throws(() => validateServiceSearchRequest({page} as any),badRequest);
  }
});

test('service validation retains valid creation, patch allowlists and empty patch rejection',() => {
  const created = validateCreateServiceRequest(validCreate);
  assert.equal(created.ownerType,'business'); assert.equal(created.priceCurrency,'SYP'); assert.equal(created.priceType,'negotiable');
  const changed = validateUpdateServiceRequest({titleAr:' عنوان جديد ',ownerId:'forged',ownerType:'professional',isFeatured:true} as any);
  assert.equal(changed.titleAr,'عنوان جديد');
  assert.equal('ownerId' in changed,false); assert.equal('ownerType' in changed,false); assert.equal('isFeatured' in changed,false);
  assert.throws(() => validateUpdateServiceRequest({}),badRequest);
  assert.throws(() => validateUpdateServiceRequest({ownerId:'forged'} as any),badRequest);
  assert.deepEqual(validateOwnerServicesRequest({ownerType:'professional'}),{ownerType:'professional'});
});
