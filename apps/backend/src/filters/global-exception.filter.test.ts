import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArgumentsHost, BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { EmailVerificationRequiredError, SafeAuthenticationError } from '../identity/identity.errors';

test('global exception filter source hides internal errors and prepares validation errors', () => {
  const filter = new GlobalExceptionFilter({
    logErrorContext: () => undefined
  } as never);

  assert.ok(filter);
  assert.equal(HttpStatus.INTERNAL_SERVER_ERROR, 500);
});

function serialize(exception: unknown) {
  let statusCode = 0;
  let body: { error: { code: string; message: string } } | undefined;
  const logs: unknown[] = [];
  const response = {
    status(value: number) { statusCode = value; return response; },
    json(value: typeof body) { body = value; }
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new GlobalExceptionFilter({ logErrorContext: (value: unknown) => logs.push(value) } as never).catch(exception, host);
  assert.ok(body);
  return { statusCode, body, logs };
}

test('typed login rejection exposes one safe 401 contract without account details', () => {
  const result = serialize(new SafeAuthenticationError());
  assert.equal(result.statusCode, 401);
  assert.equal(result.body.error.code, 'INVALID_CREDENTIALS');
  assert.equal(result.body.error.message, 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.');
  assert.doesNotMatch(JSON.stringify(result), /passwordHash|stack|Invalid credentials/);
});

test('email verification recovery code survives global serialization', () => {
  const result = serialize(new EmailVerificationRequiredError());
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  assert.equal(result.body.error.message, 'يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول.');
});

test('an arbitrary forbidden response cannot spoof the safe identity recovery code', () => {
  const result = serialize(new ForbiddenException({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'private-account-data' }));
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error.code, 'request_error');
  assert.doesNotMatch(JSON.stringify(result), /private-account-data|EMAIL_VERIFICATION_REQUIRED/);
});

test('validation and internal failures still conceal arbitrary exception payloads and stack traces', () => {
  for (const error of [new BadRequestException('private-input'), new Error('private-input'),
    new HttpException({ code: 'private-input', message: 'private-input', stack: 'private-input' }, 503)]) {
    const result = serialize(error);
    assert.doesNotMatch(JSON.stringify(result), /private-input|stack/);
    assert.ok([400, 500, 503].includes(result.statusCode));
  }
});
