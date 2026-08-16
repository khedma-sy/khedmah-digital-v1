import { Inject, Injectable } from '@nestjs/common';
import { RateLimitRepository } from '../database/rate-limit.repository';
import { RateLimitDecision } from './contact.types';

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 10;

@Injectable()
export class ContactRateLimitService {
  constructor(
    @Inject(RateLimitRepository)
    private readonly rateLimits: RateLimitRepository
  ) {}

  async check(
    key: string,
    now = Date.now()
  ): Promise<RateLimitDecision> {
    const result = await this.rateLimits.consume(
      key,
      DEFAULT_WINDOW_MS,
      DEFAULT_LIMIT,
      now
    );

    return {
      allowed: result.allowed,
      key,
      remaining: result.remaining
    };
  }
}
