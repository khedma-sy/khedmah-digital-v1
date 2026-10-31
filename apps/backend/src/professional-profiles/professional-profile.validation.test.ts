import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { validateProfessionalProfileSearch } from './professional-profile.validation';

test('professional search defaults to page one and accepts strict positive integer pages', () => {
  assert.equal(validateProfessionalProfileSearch({}).page, 1);
  assert.equal(validateProfessionalProfileSearch({ page: '2' }).page, 2);
  assert.equal(validateProfessionalProfileSearch({ page: ' 3 ' }).page, 3);
  assert.equal(validateProfessionalProfileSearch({ page: 4 }).page, 4);
});

test('professional search rejects malformed, fractional, non-positive, and unsafe page values', () => {
  const invalidPages: unknown[] = [
    '',
    '2junk',
    '1.5',
    '2e3',
    '-1',
    '0',
    '9007199254740993',
    null,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.POSITIVE_INFINITY,
    Number.NaN
  ];

  for (const page of invalidPages) {
    assert.throws(
      () => validateProfessionalProfileSearch({ page }),
      BadRequestException,
      `Expected page ${String(page)} to be rejected`
    );
  }
});
