import assert from 'node:assert/strict';
import test from 'node:test';
import { InquirySubmissionGuard } from '../components/inquiry-idempotency';

test('double click creates only one client submission attempt', () => {
  const guard = new InquirySubmissionGuard(() => 'opaque-key-00000001');
  assert.equal(guard.begin(), 'opaque-key-00000001');
  assert.equal(guard.begin(), undefined);
});

test('network retry reuses the pending journey key', () => {
  const keys = ['opaque-key-00000001', 'opaque-key-00000002'];
  const guard = new InquirySubmissionGuard(() => keys.shift()!);
  assert.equal(guard.begin(), 'opaque-key-00000001');
  guard.finish(false);
  assert.equal(guard.begin(), 'opaque-key-00000001');
});

test('new inquiry journey receives a new key', () => {
  const keys = ['opaque-key-00000001', 'opaque-key-00000002'];
  const guard = new InquirySubmissionGuard(() => keys.shift()!);
  assert.equal(guard.begin(), 'opaque-key-00000001');
  guard.finish(true);
  assert.equal(guard.begin(), undefined, 'receipt state cannot submit again');
  guard.newJourney();
  assert.equal(guard.begin(), 'opaque-key-00000002');
});
