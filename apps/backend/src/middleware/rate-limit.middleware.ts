import { HttpException, HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RateLimitRepository } from '../database/rate-limit.repository';
import { resolveRateLimitClientIp } from './client-ip';

/**
 * Shared PostgreSQL-backed fixed-window rate limiter.
 *
 * Keyed by: scope + IP. The repository hashes the final key before storage,
 * so raw client IP addresses are not persisted.
 */
export class RateLimitMiddleware {
  // Once a shared bucket is exhausted, reject repeat requests locally until
  // its reset. The bounded cache reduces database writes during a flood; the
  // PostgreSQL counter remains authoritative across instances.
  private readonly blockedUntil = new Map<string, number>();
  private static readonly MAX_LOCAL_BLOCKS = 10_000;
  constructor(
    private readonly repository: RateLimitRepository,
    private readonly scope: string,
    private readonly windowMs: number,
    private readonly max: number
  ) {}

  async use(
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    const ip = resolveRateLimitClientIp(req);
    const cachedReset = this.blockedUntil.get(ip);
    if (cachedReset !== undefined) {
      if (cachedReset > Date.now()) {
        throw new HttpException('Rate limit exceeded. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
      }
      this.blockedUntil.delete(ip);
    }

    const result = await this.repository.consume(
      `${this.scope}:${ip}`,
      this.windowMs,
      this.max
    );

    if (!result.allowed) {
      const resetAt = Date.parse(result.resetAt);
      if (Number.isFinite(resetAt) && resetAt > Date.now()) {
        if (this.blockedUntil.size >= RateLimitMiddleware.MAX_LOCAL_BLOCKS) {
          const oldest = this.blockedUntil.keys().next().value;
          if (oldest !== undefined) this.blockedUntil.delete(oldest);
        }
        this.blockedUntil.set(ip, resetAt);
      }
      throw new HttpException(
        'Rate limit exceeded. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    next();
  }
}

export function createRateLimitMiddleware(
  repository: RateLimitRepository,
  scope: string,
  windowMs: number,
  max: number
) {
  const middleware = new RateLimitMiddleware(
    repository,
    scope,
    windowMs,
    max
  );

  return middleware.use.bind(middleware);
}
