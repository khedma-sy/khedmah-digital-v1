/**
 * Global Rate Limiting Middleware — WP-03
 *
 * Protects the following endpoint groups with configurable per-route limits:
 *   - POST /auth/register
 *   - POST /auth/login
 *   - POST /auth/forgot-password
 *   - POST /contact/*
 *   - GET  /search/*
 *   - GET  /businesses (public listing)
 *   - GET  /professionals/search
 *   - GET  /service-catalog/*
 *
 * Configuration via environment variables:
 *   RATE_LIMIT_REGISTER_RPM       (default: 5)
 *   RATE_LIMIT_LOGIN_RPM          (default: 10)
 *   RATE_LIMIT_FORGOT_PASSWORD_RPM (default: 3)
 *   RATE_LIMIT_CONTACT_RPM        (default: 10)
 *   RATE_LIMIT_SEARCH_RPM         (default: 60)
 *   RATE_LIMIT_PUBLIC_API_RPM     (default: 120)
 *
 * The key is derived from the X-Forwarded-For header (first IP) or
 * the socket remote address, giving per-client limiting.
 */
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RouteRule {
  /** RegExp to match req.path */
  pattern: RegExp;
  methods: string[];
  /** Requests per minute (RPM) */
  rpm: number;
  label: string;
}

function rpm(envKey: string, defaultValue: number): number {
  const v = process.env[envKey];
  const parsed = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

@Injectable()
export class GlobalRateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GlobalRateLimitMiddleware.name);
  private readonly buckets = new Map<string, RateLimitBucket>();

  private get rules(): RouteRule[] {
    return [
      {
        pattern: /^\/auth\/register$/i,
        methods: ['POST'],
        rpm: rpm('RATE_LIMIT_REGISTER_RPM', 5),
        label: 'register'
      },
      {
        pattern: /^\/auth\/login$/i,
        methods: ['POST'],
        rpm: rpm('RATE_LIMIT_LOGIN_RPM', 10),
        label: 'login'
      },
      {
        pattern: /^\/auth\/forgot-password$/i,
        methods: ['POST'],
        rpm: rpm('RATE_LIMIT_FORGOT_PASSWORD_RPM', 3),
        label: 'forgot-password'
      },
      {
        pattern: /^\/contact\//i,
        methods: ['POST', 'GET'],
        rpm: rpm('RATE_LIMIT_CONTACT_RPM', 10),
        label: 'contact'
      },
      {
        pattern: /^\/search\//i,
        methods: ['GET', 'POST'],
        rpm: rpm('RATE_LIMIT_SEARCH_RPM', 60),
        label: 'search'
      },
      {
        pattern: /^\/businesses(\/|$)/i,
        methods: ['GET'],
        rpm: rpm('RATE_LIMIT_PUBLIC_API_RPM', 120),
        label: 'public-api'
      },
      {
        pattern: /^\/professionals\/search/i,
        methods: ['GET'],
        rpm: rpm('RATE_LIMIT_SEARCH_RPM', 60),
        label: 'search'
      },
      {
        pattern: /^\/service-catalog\//i,
        methods: ['GET'],
        rpm: rpm('RATE_LIMIT_PUBLIC_API_RPM', 120),
        label: 'public-api'
      }
    ];
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const method = req.method.toUpperCase();
    const path = req.path;
    const clientIp = this.resolveClientIp(req);

    for (const rule of this.rules) {
      if (!rule.methods.includes(method) || !rule.pattern.test(path)) {
        continue;
      }

      const key = `${rule.label}:${clientIp}`;
      const now = Date.now();
      const windowMs = 60_000; // 1 minute window

      const current = this.buckets.get(key);
      const bucket: RateLimitBucket =
        !current || current.resetAt <= now
          ? { count: 0, resetAt: now + windowMs }
          : current;

      bucket.count += 1;
      this.buckets.set(key, bucket);

      const remaining = Math.max(rule.rpm - bucket.count, 0);
      const resetSec = Math.ceil((bucket.resetAt - now) / 1000);

      res.setHeader('X-RateLimit-Limit', rule.rpm);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetSec);

      if (bucket.count > rule.rpm) {
        this.logger.warn(
          `Rate limit exceeded: rule=${rule.label} client=${clientIp} count=${bucket.count}/${rule.rpm}`
        );
        res.setHeader('Retry-After', resetSec);
        res.status(429).json({
          statusCode: 429,
          message: 'Too many requests. Please try again later.',
          error: 'Too Many Requests'
        });
        return;
      }

      break;
    }

    next();
  }

  private resolveClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0];
      return first.trim();
    }
    return req.socket?.remoteAddress ?? 'unknown';
  }
}
