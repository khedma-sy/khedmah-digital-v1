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

    const result = await this.repository.consume(
      `${this.scope}:${ip}`,
      this.windowMs,
      this.max
    );

    if (!result.allowed) {
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
