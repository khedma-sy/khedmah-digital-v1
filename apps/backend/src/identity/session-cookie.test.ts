import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { Response } from 'express';
import { attachSessionCookie, clearSessionCookie } from './session-cookie';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test('production session cookie supports the credentialed cross-site frontend', () => {
  process.env.NODE_ENV = 'production';
  let attachedOptions: Parameters<Response['cookie']>[2];
  let clearedOptions: Parameters<Response['clearCookie']>[1];
  const response = {
    cookie(_name: string, _token: string, options: Parameters<Response['cookie']>[2]) {
      attachedOptions = options;
    },
    clearCookie(_name: string, options: Parameters<Response['clearCookie']>[1]) {
      clearedOptions = options;
    }
  } as Response;

  attachSessionCookie(response, 'session-token');
  clearSessionCookie(response);

  assert.equal(attachedOptions!.sameSite, 'none');
  assert.equal(attachedOptions!.secure, true);
  assert.equal(clearedOptions!.sameSite, 'none');
  assert.equal(clearedOptions!.secure, true);
});

test('non-production session cookie retains the strict same-site boundary', () => {
  process.env.NODE_ENV = 'test';
  let options: Parameters<Response['cookie']>[2];
  const response = {
    cookie(_name: string, _token: string, cookieOptions: Parameters<Response['cookie']>[2]) {
      options = cookieOptions;
    }
  } as Response;

  attachSessionCookie(response, 'session-token');

  assert.equal(options!.sameSite, 'strict');
  assert.equal(options!.secure, false);
});
