import { isIP } from 'node:net';
import type { Request } from 'express';

function normalizeAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();

  if (trimmed.startsWith('::ffff:')) {
    const ipv4 = trimmed.slice('::ffff:'.length);
    return isIP(ipv4) === 4 ? ipv4 : undefined;
  }

  return isIP(trimmed) ? trimmed : undefined;
}

/**
 * The number of forwarded addresses *appended by trusted proxy infrastructure*.
 * Default remains one for the currently documented direct Cloud Run ingress.
 * Never increase this merely to fix rate limiting: verify actual header traces,
 * trusted ingress and prevention of direct backend bypass first.
 * Invalid/unsupported configuration ignores the untrusted header.
 */
function trustedForwardHops(): number {
  const value = process.env.RATE_LIMIT_TRUSTED_FORWARD_HOPS;
  if (value === undefined) return 1;
  if (!/^[0-9]+$/.test(value)) return 0;
  const hops = Number(value);
  return Number.isSafeInteger(hops) && hops <= 4 ? hops : 0;
}

/**
 * Resolve the rate-limit identity behind the current direct Cloud Run
 * deployment.
 *
 * The nearest forwarded address is read from the right side of XFF.
 * Client-supplied prefixes on the left must not become rate-limit identities.
 */
export function resolveRateLimitClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];

  const trustedHops = trustedForwardHops();
  if (trustedHops > 0 && typeof forwarded === 'string') {
    const addresses = forwarded.split(',');
    const firstTrusted = addresses.length - trustedHops;
    // Never promote an arbitrary client-supplied prefix when the expected
    // trusted suffix is absent or contains malformed values.
    if (firstTrusted >= 0 &&
        addresses.slice(firstTrusted).every(address => normalizeAddress(address) !== undefined)) {
      const forwardedIp = normalizeAddress(addresses[firstTrusted]);
      if (forwardedIp) return forwardedIp;
    }
  }

  return normalizeAddress(request.socket.remoteAddress) ?? 'unknown';
}
