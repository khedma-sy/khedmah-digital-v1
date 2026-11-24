import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { RateLimitRepository, RateLimitResult } from '../database/rate-limit.repository';
import { RateLimitMiddleware } from './rate-limit.middleware';

const originalHops = process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS;
afterEach(() => {
  if (originalHops === undefined) delete process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS;
  else process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = originalHops;
});

function request(xff: string | undefined, remoteAddress = '10.0.0.1'): Request {
  return {
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    socket: { remoteAddress }
  } as Request;
}

function fixture(consume: (key: string, windowMs: number, max: number) => Promise<RateLimitResult>) {
  const calls: Array<{ key: string; windowMs: number; max: number }> = [];
  let nextCalls = 0;
  const repository = {
    async consume(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
      calls.push({ key, windowMs, max });
      return consume(key, windowMs, max);
    }
  } as RateLimitRepository;
  const middleware = new RateLimitMiddleware(repository, 'orders', 60_000, 2);
  const next = (() => { nextCalls += 1; }) as NextFunction;
  const use = (req: Request) => middleware.use(req, {} as Response, next);
  return { calls, use, get nextCalls() { return nextCalls; } };
}

function allowed(): RateLimitResult {
  return { allowed: true, remaining: 1, resetAt: new Date(Date.now() + 60_000).toISOString() };
}

function forbidden(resetOffsetMs: number): RateLimitResult {
  return { allowed: false, remaining: 0, resetAt: new Date(Date.now() + resetOffsetMs).toISOString() };
}

async function expectThrottled(run: () => Promise<void>) {
  await assert.rejects(run, error => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
    return true;
  });
}

test('allowed request consumes one scoped IP bucket with the configured window and calls next', async () => {
  process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = '1';
  const f = fixture(async () => allowed());
  await f.use(request('203.0.113.99, 198.51.100.40'));
  assert.deepEqual(f.calls, [{ key: 'orders:198.51.100.40', windowMs: 60_000, max: 2 }]);
  assert.equal(f.nextCalls, 1);
});

test('different forged XFF prefixes cannot escape a blocked IP bucket', async () => {
  process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = '1';
  const f = fixture(async () => forbidden(60_000));
  await expectThrottled(() => f.use(request('203.0.113.1, 198.51.100.40')));
  await expectThrottled(() => f.use(request('203.0.113.2, 198.51.100.40')));
  // The second request is denied from the bounded local cache without another DB write.
  assert.deepEqual(f.calls, [{ key: 'orders:198.51.100.40', windowMs: 60_000, max: 2 }]);
  assert.equal(f.nextCalls, 0);
});

test('an expired server-provided block does not permanently deny future requests', async () => {
  process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = '0';
  let count = 0;
  const f = fixture(async () => ++count === 1 ? forbidden(-1) : allowed());
  const actor = request('203.0.113.9', '198.51.100.40');
  await expectThrottled(() => f.use(actor));
  await f.use(actor);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0]?.key, 'orders:198.51.100.40');
  assert.equal(f.nextCalls, 1);
});

test('database errors fail closed without calling next or confusing them with a 429 response', async () => {
  const failure = new Error('db unavailable');
  const f = fixture(async () => { throw failure; });
  await assert.rejects(f.use(request(undefined, '198.51.100.55')), error => error === failure);
  assert.equal(f.nextCalls, 0);
});

test('malformed trusted XFF does not create a caller-selected rate-limit bucket', async () => {
  process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = '2';
  const f = fixture(async () => allowed());
  await f.use(request('203.0.113.9, invalid', '198.51.100.55'));
  assert.equal(f.calls[0]?.key, 'orders:198.51.100.55');
  assert.equal(f.nextCalls, 1);
});
