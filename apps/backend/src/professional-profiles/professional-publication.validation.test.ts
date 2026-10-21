import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { validateProfessionalProfileUpsert } from './professional-profile.validation';

const content = { headlineAr: 'مهندس برمجيات', cityCode: 'damascus', countryCode: 'SY' };

test('professional publication intent accepts only an explicit public or private choice', () => {
  for (const visibility of ['public', 'private'] as const) {
    assert.equal(validateProfessionalProfileUpsert({ ...content, visibility }).visibility, visibility);
  }
  assert.equal(validateProfessionalProfileUpsert(content).visibility, undefined);
});

test('invalid, null or internal professional visibility cannot become owner publication intent', () => {
  for (const visibility of [null, '', 'internal', 'PUBLIC', true, 1, {}, ['public']]) {
    assert.throws(() => validateProfessionalProfileUpsert({ ...content, visibility }), BadRequestException);
  }
});
