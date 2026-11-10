import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { isReviewableQuote } from '../apps/frontend/app/orders/quote-refresh.ts';

test('quote review accepts exactly the numeric cash totals accepted by the server', async () => {
  const source = await readFile(new URL('../apps/backend/src/orders/order-money.ts', import.meta.url), 'utf8');
  const importLine = 'import { BadRequestException } from "@nestjs/common";';
  assert.ok(source.includes(importLine), 'expected backend validator import');
  // Keep the real backend validator and replace only its framework error type.
  const js = stripTypeScriptTypes(source.replace(importLine, 'class BadRequestException extends Error {}'));
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
  const { orderMoneyCents } = await import(moduleUrl);
  const quote = { id: 'test', status: 'quoted', updatedAt: '2026-11-10T01:00:00.000Z', currency: 'SYP' };
  const totals = [0, -0, NaN, Infinity, -Infinity, -1, 1.234, 1_000_000_000_000,
    999_999_999_999.99, 10_000_000_000.03, 0.1 + 0.2, 1e-8, 1e-10];
  let seed = 0x12345678;
  for (let i = 0; i < 1000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const integer = seed % 1_000_000;
    totals.push(integer / 100, integer / 1000, integer / 100 + 1e-10,
      999_999_999_000 + (integer % 100000) / 100,
      999_999_999_999 + (integer % 1000) / 1000);
  }
  for (const total of totals) {
    let accepted = true;
    try { orderMoneyCents(total, 'total'); } catch { accepted = false; }
    assert.equal(isReviewableQuote({ ...quote, total }), accepted, `total ${total}`);
  }
});
