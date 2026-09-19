import assert from 'node:assert/strict';
import test from 'node:test';
import { DriverDocumentReviewService } from './driver-document-review.service';

test('driver review queue checks reviewer permission before reading any private document metadata',async()=>{
  let reads=0;
  const service=new DriverDocumentReviewService({query:async()=>{reads++;return [];}} as never,{getCurrentUser:async()=>({id:'owner',email:'owner@example.test'})} as never,{assert(){throw new Error('REVIEW_DENIED');}} as never);
  await assert.rejects(service.reviewQueue('fixture'),/REVIEW_DENIED/);assert.equal(reads,0);
});
