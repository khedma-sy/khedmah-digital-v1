import { Injectable, NestMiddleware } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-process sliding-window rate limiter middleware.
 * Configurable via environment variables:
 *   RATE_LIMIT_WINDOW_MS  — window size in ms (default 60000)
 *   RATE_LIMIT_MAX        — max requests per window (default 60)
 *
 * Keyed by: IP + route prefix so auth/search/contact endpoints
 * get independent limits via separate middleware bindings.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly scope: string;

  constructor(scope: string, windowMs?: number, max?: number) {
    this.scope = scope;
    this.windowMs = windowMs ?? parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);
    this.max = max ?? parseInt(process.env.RATE_LIMIT_MAX ?? '60', 10);
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';
    const key = `${this.scope}:${ip}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    const bucket: Bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + this.windowMs }
      : current;

    bucket.count += 1;
    this.buckets.set(key, bucket);

    if (bucket.count > this.max) {
      throw new HttpException('Rate limit exceeded. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    next();
  }
}

export function createRateLimitMiddleware(scope: string, windowMs?: number, max?: number) {
  return new RateLimitMiddleware(scope, windowMs, max);
}
