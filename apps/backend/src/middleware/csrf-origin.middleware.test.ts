import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createCsrfOriginMiddleware } from './csrf-origin.middleware';

const originalCorsOrigin = process.env.CORS_ORIGIN;
const allowedOrigin = 'https://frontend.example.test';

afterEach(() => {
  if (originalCorsOrigin === undefined) {
    delete process.env.CORS_ORIGIN;
  } else {
    process.env.CORS_ORIGIN = originalCorsOrigin;
  }
});

function runMiddleware(input: {
  method: string;
  cookie?: string;
  origin?: string;
  referer?: string;
  configuredOrigins?: string;
}) {
  process.env.CORS_ORIGIN = input.configuredOrigins ?? allowedOrigin;

  let nextCalls = 0;
  let statusCode: number | undefined;
  let responseBody: unknown;

  const request = {
    method: input.method,
    headers: {
      ...(input.cookie ? { cookie: input.cookie } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.referer ? { referer: input.referer } : {})
    }
  } as Request;

  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      responseBody = body;
      return this;
    }
  } as unknown as Response;

  const next = (() => {
    nextCalls += 1;
  }) as NextFunction;

  createCsrfOriginMiddleware()(request, response, next);

  return {
    nextCalls,
    statusCode,
    responseBody
  };
}

test('safe GET request bypasses CSRF origin validation', () => {
  const result = runMiddleware({
    method: 'GET',
    cookie: 'khedmah_session=session-token'
  });

  assert.equal(result.nextCalls, 1);
  assert.equal(result.statusCode, undefined);
});

test('unsafe request without session cookie bypasses browser-session CSRF validation', () => {
  const result = runMiddleware({
    method: 'POST',
    origin: 'https://evil.example'
  });

  assert.equal(result.nextCalls, 1);
  assert.equal(result.statusCode, undefined);
});

test('unsafe session request accepts the configured Origin', () => {
  const result = runMiddleware({
    method: 'POST',
    cookie: 'khedmah_session=session-token',
    origin: allowedOrigin
  });

  assert.equal(result.nextCalls, 1);
  assert.equal(result.statusCode, undefined);
});

test('unsafe session request accepts every explicitly configured Origin', () => {
  const result = runMiddleware({
    method: 'POST',
    cookie: 'khedmah_session=session-token',
    origin: 'https://frontend-alt.example.test',
    configuredOrigins: `${allowedOrigin}, https://frontend-alt.example.test`
  });

  assert.equal(result.nextCalls, 1);
  assert.equal(result.statusCode, undefined);
});

test('unsafe session request accepts configured origin derived from Referer when Origin is absent', () => {
  const result = runMiddleware({
    method: 'PATCH',
    cookie: 'other=value; khedmah_session=session-token',
    referer: `${allowedOrigin}/account/profile`
  });

  assert.equal(result.nextCalls, 1);
  assert.equal(result.statusCode, undefined);
});

test('unsafe session request rejects an untrusted Origin', () => {
  const result = runMiddleware({
    method: 'DELETE',
    cookie: 'khedmah_session=session-token',
    origin: 'https://evil.example'
  });

  assert.equal(result.nextCalls, 0);
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.responseBody, {
    statusCode: 403,
    message: 'Request origin is not allowed.'
  });
});

test('unsafe session request fails closed when both Origin and Referer are absent', () => {
  const result = runMiddleware({
    method: 'POST',
    cookie: 'khedmah_session=session-token'
  });

  assert.equal(result.nextCalls, 0);
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.responseBody, {
    statusCode: 403,
    message: 'Request origin is not allowed.'
  });
});
