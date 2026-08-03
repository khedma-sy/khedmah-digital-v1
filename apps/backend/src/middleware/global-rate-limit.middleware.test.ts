/**
 * Global Rate Limit Middleware — unit tests (WP-03)
 *
 * These tests do not require a database; they test the middleware in isolation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GlobalRateLimitMiddleware } from './global-rate-limit.middleware';
import type { Request, Response, NextFunction } from 'express';

function makeReq(method: string, path: string, ip = '1.2.3.4'): Request {
  return {
    method,
    path,
    headers: {},
    socket: { remoteAddress: ip }
  } as unknown as Request;
}

function makeRes(): { status: jest.Mock | ((code: number) => { json: (body: unknown) => void }); headers: Record<string, string | number>; statusCode: number; ended: boolean } {
  const res: {
    headers: Record<string, string | number>;
    statusCode: number;
    ended: boolean;
    status(code: number): { json(body: unknown): void };
    setHeader(name: string, value: string | number): void;
  } = {
    headers: {},
    statusCode: 200,
    ended: false,
    status(code: number) {
      res.statusCode = code;
      return {
        json(_body: unknown) {
          res.ended = true;
        }
      };
    },
    setHeader(name: string, value: string | number) {
      res.headers[name.toLowerCase()] = value;
    }
  };
  return res as unknown as ReturnType<typeof makeRes>;
}

test('rate limit middleware: allows requests within limit', () => {
  process.env.RATE_LIMIT_LOGIN_RPM = '5';
  const middleware = new GlobalRateLimitMiddleware();

  let nextCalled = 0;
  const next: NextFunction = () => { nextCalled++; };

  for (let i = 0; i < 5; i++) {
    const req = makeReq('POST', '/auth/login', '10.0.0.1');
    const res = makeRes();
    middleware.use(req, res as unknown as Response, next);
    assert.equal((res as unknown as { ended: boolean }).ended, false, `request ${i + 1} should not be blocked`);
  }
  assert.equal(nextCalled, 5);
});

test('rate limit middleware: blocks requests exceeding limit', () => {
  process.env.RATE_LIMIT_REGISTER_RPM = '3';
  const middleware = new GlobalRateLimitMiddleware();

  const next: NextFunction = () => {};
  let blocked = 0;

  for (let i = 0; i < 5; i++) {
    const req = makeReq('POST', '/auth/register', '10.0.0.2');
    const res = makeRes();
    middleware.use(req, res as unknown as Response, next);
    if ((res as unknown as { ended: boolean }).ended) blocked++;
  }

  assert.ok(blocked >= 1, 'At least one request should be blocked after limit exceeded');
});

test('rate limit middleware: sets X-RateLimit headers', () => {
  process.env.RATE_LIMIT_LOGIN_RPM = '10';
  const middleware = new GlobalRateLimitMiddleware();

  const req = makeReq('POST', '/auth/login', '10.0.0.3');
  const res = makeRes();
  const next: NextFunction = () => {};

  middleware.use(req, res as unknown as Response, next);

  assert.ok('x-ratelimit-limit' in (res as unknown as { headers: Record<string, string | number> }).headers, 'X-RateLimit-Limit should be set');
  assert.ok('x-ratelimit-remaining' in (res as unknown as { headers: Record<string, string | number> }).headers, 'X-RateLimit-Remaining should be set');
});

test('rate limit middleware: does not rate-limit unmatched routes', () => {
  const middleware = new GlobalRateLimitMiddleware();
  let nextCalled = 0;
  const next: NextFunction = () => { nextCalled++; };

  const req = makeReq('GET', '/health', '10.0.0.4');
  const res = makeRes();
  middleware.use(req, res as unknown as Response, next);

  assert.equal(nextCalled, 1, 'next() should be called for unmatched routes');
  assert.equal((res as unknown as { ended: boolean }).ended, false);
});

test('rate limit middleware: uses X-Forwarded-For header for client IP', () => {
  process.env.RATE_LIMIT_SEARCH_RPM = '2';
  const middleware = new GlobalRateLimitMiddleware();

  const next: NextFunction = () => {};
  let blocked = 0;

  for (let i = 0; i < 4; i++) {
    const req = {
      method: 'GET',
      path: '/search/businesses',
      headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.0' },
      socket: { remoteAddress: '127.0.0.1' }
    } as unknown as Request;
    const res = makeRes();
    middleware.use(req, res as unknown as Response, next);
    if ((res as unknown as { ended: boolean }).ended) blocked++;
  }

  assert.ok(blocked >= 1, 'Should block after limit using forwarded IP');
});

test('rate limit middleware: reads RPM from environment variables', () => {
  process.env.RATE_LIMIT_FORGOT_PASSWORD_RPM = '2';
  const middleware = new GlobalRateLimitMiddleware();

  const next: NextFunction = () => {};
  const responses: Array<{ ended: boolean }> = [];

  for (let i = 0; i < 3; i++) {
    const req = makeReq('POST', '/auth/forgot-password', '10.0.0.10');
    const res = makeRes();
    middleware.use(req, res as unknown as Response, next);
    responses.push({ ended: (res as unknown as { ended: boolean }).ended });
  }

  const blocked = responses.filter(r => r.ended).length;
  assert.ok(blocked >= 1, 'Should respect RATE_LIMIT_FORGOT_PASSWORD_RPM=2');
});
