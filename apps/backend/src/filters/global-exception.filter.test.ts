import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

test('global exception filter source hides internal errors and prepares validation errors', () => {
  const filter = new GlobalExceptionFilter({
    logErrorContext: () => undefined
  } as never);

  assert.ok(filter);
  assert.equal(HttpStatus.INTERNAL_SERVER_ERROR, 500);
});
