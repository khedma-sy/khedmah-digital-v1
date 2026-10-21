import assert from 'node:assert/strict';
import test from 'node:test';
import { TaxiOperationalApprovalService } from './taxi-operational-approval.service';

test('Taxi operational approval evaluates the latest uploaded asset even before it has a review row', () => {
  const service = new TaxiOperationalApprovalService({} as never, {} as never, {} as never);
  const sql = (service as unknown as { latestDocumentsSql(): string }).latestDocumentsSql();

  assert.match(sql, /WITH latest_assets AS/);
  assert.match(sql, /SELECT DISTINCT ON \(m\.asset_type\)/);
  assert.match(sql, /FROM media_assets m/);
  assert.match(sql, /LEFT JOIN mobility_document_reviews r ON r\.media_asset_id=a\.media_asset_id/);
  assert.match(sql, /COALESCE\(r\.status,'pending'\) AS status/);
  assert.doesNotMatch(sql, /DISTINCT ON \(r\.document_type\)/);
});
