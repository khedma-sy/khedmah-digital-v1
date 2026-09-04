import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration=readFileSync(new URL('../../../../backend/migrations/versions/034_mobility_delivery_proof.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../../../../backend/migrations/versions/034_mobility_delivery_proof_rollback.sql',import.meta.url),'utf8');

test('delivery migration separates package fields and stores only verification hashes',()=>{
  assert.match(migration,/ADD COLUMN package_description TEXT/);
  assert.match(migration,/ADD COLUMN delivery_contract_version SMALLINT NOT NULL DEFAULT 1/);
  assert.match(migration,/package_size IN \('small','medium','large'\)/);
  assert.match(migration,/ADD COLUMN pickup_verification_hash TEXT/);
  assert.match(migration,/ADD COLUMN delivery_verification_hash TEXT/);
  assert.doesNotMatch(migration,/ADD COLUMN .*(_pin|_code) TEXT/);
  assert.match(migration,/mobility_requests_delivery_shape_check/);
});

test('delivery migration has an independently scoped rollback',()=>{
  assert.match(rollback,/DROP COLUMN IF EXISTS delivery_verification_hash/);
  assert.match(rollback,/DROP CONSTRAINT IF EXISTS mobility_requests_delivery_shape_check/);
});
