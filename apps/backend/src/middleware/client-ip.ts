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
 * Resolve the rate-limit identity behind the current direct Cloud Run
 * deployment.
 *
 * The nearest forwarded address is read from the right side of XFF.
 * Client-supplied prefixes on the left must not become rate-limit identities.
 */
export function resolveRateLimitClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];

  if (typeof forwarded === 'string') {
    const addresses = forwarded
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    for (let index = addresses.length - 1; index >= 0; index -= 1) {
      const forwardedIp = normalizeAddress(addresses[index]);
      if (forwardedIp) {
        return forwardedIp;
      }
    }
  }

  return normalizeAddress(request.socket.remoteAddress) ?? 'unknown';
}
