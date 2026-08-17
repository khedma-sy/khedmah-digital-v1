import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request } from 'express';
import { resolveRateLimitClientIp } from './client-ip';

function request(
  forwarded: string | undefined,
  remoteAddress: string | undefined
): Request {
  return {
    headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
    socket: { remoteAddress }
  } as Request;
}

test('uses socket address when X-Forwarded-For is absent', () => {
  assert.equal(
    resolveRateLimitClientIp(request(undefined, '198.51.100.10')),
    '198.51.100.10'
  );
});

test('accepts a single valid forwarded address', () => {
  assert.equal(
    resolveRateLimitClientIp(request('198.51.100.20', '10.0.0.1')),
    '198.51.100.20'
  );
});

test('client supplied XFF prefix cannot override nearest forwarded address', () => {
  assert.equal(
    resolveRateLimitClientIp(
      request('203.0.113.77, 198.51.100.42', '10.0.0.1')
    ),
    '198.51.100.42'
  );
});

test('rotating spoofed prefixes resolve to one stable client identity', () => {
  const resolved = Array.from({ length: 35 }, (_, index) =>
    resolveRateLimitClientIp(
      request(
        `203.0.113.${index + 1}, 198.51.100.42`,
        '10.0.0.1'
      )
    )
  );

  assert.equal(new Set(resolved).size, 1);
  assert.equal(resolved[0], '198.51.100.42');
});

test('normalizes IPv4-mapped IPv6 socket addresses', () => {
  assert.equal(
    resolveRateLimitClientIp(
      request(undefined, '::ffff:198.51.100.50')
    ),
    '198.51.100.50'
  );
});

test('malformed forwarded values fall back to socket address', () => {
  assert.equal(
    resolveRateLimitClientIp(
      request('not-an-ip, still-not-an-ip', '198.51.100.60')
    ),
    '198.51.100.60'
  );
});
