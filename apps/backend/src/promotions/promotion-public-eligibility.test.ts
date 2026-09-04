import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('./promotion.repository.ts',import.meta.url),'utf8');
const eligibility=[
  "b.visibility='public'",
  "b.moderation_status='approved'",
  "b.trust_status='approved'",
  "b.status='active'",
];

test('claim and redemption recheck the business public eligibility inside their transactions',()=>{
  const claim=source.slice(source.indexOf('async issueClaim'),source.indexOf('async listClaims'));
  const redeem=source.slice(source.indexOf('async redeem'),source.indexOf('async pending'));
  for(const gate of eligibility){
    assert.match(claim,new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.match(redeem,new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  assert.match(redeem,/redeemed_count<total_limit/);
  assert.match(redeem,/RETURNING id/);
});
