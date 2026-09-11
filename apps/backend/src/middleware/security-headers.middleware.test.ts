import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createSecurityHeadersMiddleware } from './security-headers.middleware';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function run(environment: string) {
  process.env.NODE_ENV = environment;
  const headers = new Map<string, string>();
  let nextCalls = 0;
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    }
  } as unknown as Response;
  const next = (() => { nextCalls += 1; }) as NextFunction;

  createSecurityHeadersMiddleware()({} as Request, response, next);
  return { headers, nextCalls };
}

test('backend security middleware sets baseline headers', () => {
  const { headers, nextCalls } = run('development');
  assert.equal(nextCalls, 1);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'no-referrer');
  assert.equal(headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(headers.has('strict-transport-security'), false);
});

for (const environment of ['production', 'preview', 'staging']) {
  test(`${environment} enables HSTS`, () => {
    const { headers } = run(environment);
    assert.equal(headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  });
}
