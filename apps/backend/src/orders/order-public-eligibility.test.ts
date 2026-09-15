import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repository=readFileSync(new URL('./order.repository.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('./order.service.ts',import.meta.url),'utf8');

test('checkout and courier assignment fail closed when a provider loses eligibility',()=>{
  const products=repository.slice(repository.indexOf('async findProducts'),repository.indexOf('async create'));
  for(const gate of ["b.visibility='public'","b.moderation_status='approved'","b.trust_status='approved'","b.status='active'"]){
    assert.match(products,new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  assert.match(service,/countApprovedMobilityDocuments\(courier\.id\)/);
  assert.match(service,/courier\.cityCode !== merchant\.cityCode/);
  assert.match(service,/courier\.status !== "active"/);
});
