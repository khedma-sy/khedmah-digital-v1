import assert from 'node:assert/strict';
import test from 'node:test';
import { isReviewableQuote, pendingQuoteIds, reloadQuoteForReview } from '../apps/frontend/app/orders/quote-refresh.ts';

test('a stale quote is blocked before a successful refresh and requires review', async () => {
  const events = [];
  await reloadQuoteForReview({
    markStale: () => events.push('blocked'),
    refresh: async () => { events.push('refresh'); return 'updated'; },
    showStatus: (message) => events.push(message),
  });
  assert.deepEqual(events.slice(0, 2), ['blocked', 'refresh']);
  assert.match(events[2], /تم تحديث.*راجع الإجمالي/);
  assert.equal(events.length, 3, 'refresh does not submit another confirmation');
});

test('a failed or interrupted refresh never claims the quote was updated', async () => {
  for (const refresh of [async () => 'failed', async () => { throw new Error('offline'); }]) {
    const events = [];
    await reloadQuoteForReview({
      markStale: () => events.push('blocked'),
      refresh,
      showStatus: (message) => events.push(message),
    });
    assert.equal(events[0], 'blocked');
    assert.match(events[1], /تعذر تحديث.*انتظر التحديث/);
    assert.doesNotMatch(events[1], /تم تحديث/);
  }
});

test('a superseded refresh cannot replace the result of a newer successful reload', async () => {
  let finishOld;
  const oldRefresh = new Promise((resolve) => { finishOld = resolve; });
  const events = [];
  const oldWork = reloadQuoteForReview({
    markStale: () => events.push('blocked'),
    refresh: () => oldRefresh,
    showStatus: (message) => events.push(message),
  });
  events.push('newer reload succeeded');
  finishOld('superseded');
  await oldWork;
  assert.deepEqual(events, ['blocked', 'newer reload succeeded']);
});

test('each stale order remains blocked until its own usable quote or removal', () => {
  const blocked = new Set(['valid', 'missing-total', 'bad-currency', 'removed', 'changed-status']);
  const pending = pendingQuoteIds(blocked, [
    { id: 'valid', status: 'quoted', total: 10, updatedAt: '2026-11-10T01:00:00.000Z', currency: 'SYP' },
    { id: 'missing-total', status: 'quoted', updatedAt: '2026-11-10T01:00:00.000Z', currency: 'SYP' },
    { id: 'bad-currency', status: 'quoted', total: 10, updatedAt: '2026-11-10T01:00:00.000Z', currency: 'BAD' },
    { id: 'changed-status', status: 'cancelled' },
  ]);
  assert.deepEqual([...pending], ['missing-total', 'bad-currency']);
});

test('a quoted order needs a valid amount, currency and canonical timestamp', () => {
  const valid = { id: 'one', status: 'quoted', total: 0, updatedAt: '2026-11-10T01:00:00.000Z', currency: 'SYP' };
  assert.equal(isReviewableQuote(valid), true);
  for (const patch of [
    { total: -1 }, { total: NaN }, { total: undefined }, { currency: 'BAD' },
    { updatedAt: '2026-11-10' }, { updatedAt: '2026-02-30T01:00:00.000Z' },
    { status: 'cancelled' },
  ]) assert.equal(isReviewableQuote({ ...valid, ...patch }), false);
});

test('an incomplete refreshed quote remains blocked with an explicit message', async () => {
  const events = [];
  await reloadQuoteForReview({
    markStale: () => events.push('blocked'),
    refresh: async () => 'incomplete',
    showStatus: (message) => events.push(message),
  });
  assert.equal(events[0], 'blocked');
  assert.match(events[1], /الإجمالي غير متاح.*انتظر/);
});
