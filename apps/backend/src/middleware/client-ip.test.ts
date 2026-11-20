import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { Request } from 'express';
import { resolveRateLimitClientIp } from './client-ip';

const originalTrustedHops = process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS;

afterEach(() => {
  if (originalTrustedHops === undefined) delete process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS;
  else process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = originalTrustedHops;
});

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

test('a malformed nearest hop cannot promote a client-supplied prefix', () => {
  assert.equal(
    resolveRateLimitClientIp(request('203.0.113.77, invalid', '198.51.100.60')),
    '198.51.100.60'
  );
});

test('a proxy hop remains the rate-limit identity until its topology is trusted', () => {
  const first = resolveRateLimitClientIp(request('203.0.113.10, 198.51.100.5', '10.0.0.1'));
  const second = resolveRateLimitClientIp(request('203.0.113.11, 198.51.100.5', '10.0.0.1'));
  assert.equal(first, '198.51.100.5');
  assert.equal(second, first);
});

test('explicit zero trusted hops never trusts XFF from a direct client', () => {
  process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = '0';
  assert.equal(
    resolveRateLimitClientIp(request('203.0.113.55', '198.51.100.70')),
    '198.51.100.70'
  );
});

test('two verified appended hops select the client before the trusted proxy suffix', () => {
  process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = '2';
  const first = resolveRateLimitClientIp(request('203.0.113.99, 198.51.100.21, 192.0.2.10', '10.0.0.1'));
  const second = resolveRateLimitClientIp(request('203.0.113.100, 198.51.100.21, 192.0.2.10', '10.0.0.1'));
  assert.equal(first, '198.51.100.21');
  assert.equal(second, first);
});

test('unproven hop count and malformed trusted suffix fail closed to socket identity', () => {
  process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = '2';
  assert.equal(resolveRateLimitClientIp(request('203.0.113.33', '198.51.100.90')), '198.51.100.90');
  assert.equal(resolveRateLimitClientIp(request('203.0.113.33, invalid', '198.51.100.90')), '198.51.100.90');
  for (const invalid of ['abc', '-1', '5', '1.5', '']) {
    process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = invalid;
    assert.equal(resolveRateLimitClientIp(request('203.0.113.33', '198.51.100.90')), '198.51.100.90');
  }
});

test('external Google Load Balancer two-address suffix ignores forged client prefix', () => {
  // Google's external HTTP(S) Load Balancer appends CLIENT_IP, LOAD_BALANCER_IP
  // after any untrusted XFF values that the caller supplied.
  // https://docs.cloud.google.com/load-balancing/docs/https#x-forwarded-for_header
  process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS = '2';
  const legitimate = resolveRateLimitClientIp(
    request('203.0.113.77, 198.51.100.44, 192.0.2.3', '10.0.0.1')
  );
  const changedSpoof = resolveRateLimitClientIp(
    request('203.0.113.99, 198.51.100.44, 192.0.2.3', '10.0.0.1')
  );
  assert.equal(legitimate, '198.51.100.44');
  assert.equal(changedSpoof, legitimate);
});

test('a load-balancer suffix must not be assumed under the default direct ingress configuration', () => {
  delete process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS;
  // One-hop mode deliberately resolves the final address, so deployment
  // operators must verify topology before enabling a two-hop LB path.
  assert.equal(
    resolveRateLimitClientIp(request('198.51.100.44, 192.0.2.3', '10.0.0.1')),
    '192.0.2.3'
  );
});
