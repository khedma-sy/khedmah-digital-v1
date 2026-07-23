import { Injectable } from '@nestjs/common';
import { RateLimitDecision } from './contact.types';

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 10;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class ContactRateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();

  check(key: string, now = Date.now()): RateLimitDecision {
    const current = this.buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + DEFAULT_WINDOW_MS } : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);

    return {
      allowed: bucket.count <= DEFAULT_LIMIT,
      key,
      remaining: Math.max(DEFAULT_LIMIT - bucket.count, 0)
    };
  }
}
