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

test('unified search accepts strict decimal coordinates and map boundaries', () => {
  const coordinates = validatePublicSearchRequest({ latitude: '33.5', longitude: '36.25' });
  assert.equal(coordinates.latitude, 33.5);
  assert.equal(coordinates.longitude, 36.25);

  const individual = validatePublicSearchRequest({ south: '32', west: '35', north: '34', east: '37' });
  assert.deepEqual(individual.boundaries, { south: 32, west: 35, north: 34, east: 37 });

  const packed = validatePublicSearchRequest({ boundaries: '32,35,34,37' });
  assert.deepEqual(packed.boundaries, { south: 32, west: 35, north: 34, east: 37 });
});

test('unified search rejects empty, non-decimal, and non-numeric coordinate values', () => {
  for (const value of ['', ' ', null, true, [], {}, '0x10', '1e2', 'Infinity', NaN, Infinity, -Infinity]) {
    assert.throws(() => validatePublicSearchRequest({ latitude: value } as any), badRequest, `latitude=${String(value)}`);
    assert.throws(() => validatePublicSearchRequest({ longitude: value } as any), badRequest, `longitude=${String(value)}`);
  }
});

test('unified search rejects empty or non-numeric individual and packed map boundaries', () => {
  const base = { south: '32', west: '35', north: '34', east: '37' };
  for (const field of ['south', 'west', 'north', 'east'] as const) {
    for (const value of ['', ' ', null, true, [], {}, '0x10', '1e2', Infinity]) {
      assert.throws(() => validatePublicSearchRequest({ ...base, [field]: value } as any), badRequest, `${field}=${String(value)}`);
    }
  }
  assert.throws(() => validatePublicSearchRequest({ boundaries: '32,,34,37' }), badRequest);
});
