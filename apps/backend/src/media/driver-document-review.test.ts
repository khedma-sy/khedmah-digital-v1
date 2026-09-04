import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service=readFileSync(new URL('./media.service.ts',import.meta.url),'utf8');
const businessRepository=readFileSync(new URL('../business-profiles/business-profile.repository.ts',import.meta.url),'utf8');
const professionalRepository=readFileSync(new URL('../professional-profiles/professional-profile.repository.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../../../../backend/migrations/versions/033_mobility_document_reviews.sql',import.meta.url),'utf8');

test('driver documents have persistent decisions, audit events, and an approved-only publication gate',()=>{
  assert.match(migration,/CREATE TABLE mobility_document_reviews/);
  assert.match(migration,/CREATE TABLE mobility_document_review_events/);
  assert.match(migration,/status IN \('pending','approved','rejected'\)/);
  assert.match(service,/this\.rbac\.assert\(actor\.email,'security\.manage'\)/);
  assert.match(service,/INSERT INTO mobility_document_review_events/);
  assert.match(service,/status==='rejected'/);
  assert.match(service,/SET visibility='private',moderation_status='pending',trust_status='pending'/);
  assert.match(service,/DRIVER_DOCUMENT_TYPES\.has\(rows\[0\]\.asset_type/);
  assert.match(businessRepository,/JOIN mobility_document_reviews r ON r\.media_asset_id = m\.id AND r\.status = 'approved'/);
  assert.match(businessRepository,/countApprovedMobilityDocuments/);
  assert.match(businessRepository,/trust_status = 'approved', updated_at = \$2/);
  assert.match(professionalRepository,/lifecycle_status = 'active', updated_at = \$2/);
  assert.match(businessRepository,/FROM business_profiles b WHERE b\.id = \$2/);
  assert.match(professionalRepository,/FROM professional_profiles p WHERE p\.professional_profile_identifier = \$2/);
});
