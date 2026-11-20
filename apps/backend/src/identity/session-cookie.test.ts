import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { Response } from 'express';
import { attachSessionCookie, clearSessionCookie, readSessionToken } from './session-cookie';

const originalNodeEnv = process.env.NODE_ENV;
const originalSameSite = process.env.SESSION_COOKIE_SAME_SITE;

test('malformed and empty client cookies cannot crash session parsing', () => {
  for (const cookie of [undefined, 'unrelated=value', 'khedmah_session=', 'khedmah_session=%', 'khedmah_session=%E0%A4%A']) {
    assert.equal(readSessionToken(cookie), undefined);
  }
  assert.equal(readSessionToken('unrelated=value; khedmah_session=owner%2Fsession'), 'owner/session');
});

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  if (originalSameSite === undefined) delete process.env.SESSION_COOKIE_SAME_SITE;
  else process.env.SESSION_COOKIE_SAME_SITE = originalSameSite;
});

for (const environment of ['production', 'preview', 'staging']) test(`${environment} session cookie supports the credentialed cross-site frontend`, () => {
  process.env.NODE_ENV = environment;
  delete process.env.SESSION_COOKIE_SAME_SITE;
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
  assert.equal(attachedOptions!.httpOnly, true);
  assert.equal(attachedOptions!.path, '/api/v1');
  assert.equal(clearedOptions!.sameSite, 'none');
  assert.equal(clearedOptions!.secure, true);
});

test('same-site deployments can opt in to Lax for both setting and clearing', () => {
  process.env.NODE_ENV = 'production';
  process.env.SESSION_COOKIE_SAME_SITE = 'lax';
  let setOptions: Parameters<Response['cookie']>[2];
  let clearOptions: Parameters<Response['clearCookie']>[1];
  const response = {
    cookie(_name: string, _token: string, options: Parameters<Response['cookie']>[2]) { setOptions = options; },
    clearCookie(_name: string, options: Parameters<Response['clearCookie']>[1]) { clearOptions = options; },
  } as Response;
  attachSessionCookie(response, 'session-token');
  clearSessionCookie(response);
  assert.equal(setOptions!.sameSite, 'lax');
  assert.equal(clearOptions!.sameSite, 'lax');
  assert.equal(setOptions!.secure, true);
});

test('local test session cookie retains the strict same-site boundary', () => {
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
