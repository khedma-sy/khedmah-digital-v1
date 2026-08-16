import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from './database.pool';

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: string;
}

@Injectable()
export class RateLimitRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async consume(
    key: string,
    windowMs: number,
    limit: number,
    now = Date.now()
  ): Promise<RateLimitResult> {
    const bucketKey = createHash('sha256').update(key).digest('hex');
    const nowIso = new Date(now).toISOString();
    const nextResetAt = new Date(now + windowMs).toISOString();

    const rows = await this.db.query<{
      request_count: number;
      reset_at: Date;
    }>(
      `INSERT INTO rate_limit_buckets
         (bucket_key, request_count, reset_at, updated_at)
       VALUES ($1, 1, $2::timestamptz, $3::timestamptz)
       ON CONFLICT (bucket_key) DO UPDATE SET
         request_count = CASE
           WHEN rate_limit_buckets.reset_at <= $3::timestamptz THEN 1
           ELSE rate_limit_buckets.request_count + 1
         END,
         reset_at = CASE
           WHEN rate_limit_buckets.reset_at <= $3::timestamptz
             THEN $2::timestamptz
           ELSE rate_limit_buckets.reset_at
         END,
         updated_at = $3::timestamptz
       RETURNING request_count, reset_at`,
      [bucketKey, nextResetAt, nowIso]
    );

    const bucket = rows[0];
    if (!bucket) {
      throw new Error('Rate limit bucket update failed.');
    }

    return {
      allowed: bucket.request_count <= limit,
      remaining: Math.max(limit - bucket.request_count, 0),
      resetAt: bucket.reset_at.toISOString()
    };
  }
}
