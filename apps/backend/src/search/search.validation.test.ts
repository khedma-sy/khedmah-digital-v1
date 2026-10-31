import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { validatePublicSearchRequest } from './search.validation';

const badRequest = (error: unknown): boolean => error instanceof BadRequestException && error.getStatus() === 400;

test('unified search defaults to page one and accepts positive decimal pages with safe offsets', () => {
  for (const [input, expected] of [[undefined, 1], [1, 1], ['1', 1], ['02', 2], [3, 3], ['57', 57]] as const) {
    assert.equal(validatePublicSearchRequest({ page: input }).page, expected);
  }
});

test('unified search rejects numeric prefixes, fractions, non-positive pages and unsafe offsets', () => {
  for (const page of ['', ' ', '2abc', '2.5', '1e3', '0x10', '+2', '-1', 'Infinity', 'NaN',
    '9007199254740993', ' 2 ', 0, -1, 1.5, NaN, Infinity, -Infinity, null, true, [], {},
    Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validatePublicSearchRequest({ page }), badRequest, `page=${String(page)}`);
  }
});
