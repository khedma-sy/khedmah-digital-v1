import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabasePool } from '../database/database.pool';
import { VerificationReviewService } from './verification-review.service';

const reviewedRevision = '2026-10-20T12:00:00.000000Z';
const newerRevision = '2026-10-20T12:01:00.000000Z';

for (const scenario of ['superseded_request', 'changed_profile'] as const) {
  test(`verification approval denies ${scenario} without changing request or audit history`, async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SELECT entity_type,entity_id FROM verification_requests')) {
          return { rows: [{ entity_type: 'professional', entity_id: 'professional-1' }], rowCount: 1 };
        }
        if (sql.includes('FROM professional_profiles') && sql.includes('FOR UPDATE')) {
          return { rows: [{
            label: 'Professional', owner_user_id: 'owner', trust_status: null,
            moderation_status: 'pending', status: null, lifecycle_status: 'active',
            revision: scenario === 'changed_profile' ? newerRevision : reviewedRevision,
            profile_summary: { entityType: 'professional', headlineAr: 'Professional', skills: [], cityCode: 'damascus', countryCode: 'SY' }
          }], rowCount: 1 };
        }
        if (sql.includes('SELECT id,status,created_at FROM verification_requests')) {
          return { rows: [{
            id: scenario === 'superseded_request' ? 'newer-request' : 'reviewed-request',
            status: 'pending', created_at: new Date()
          }], rowCount: 1 };
        }
        throw new Error(`Unexpected statement after stale review guard: ${sql}`);
      }
    } as unknown as PoolClient;
    const db = {
      transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
    } as unknown as DatabasePool;
    const service = new VerificationReviewService(
      db,
      { getCurrentUser: async () => ({ id: 'independent-reviewer', email: 'reviewer@example.test' }) } as any,
      { assertAny: () => undefined, assert: () => undefined } as any
    );

    await assert.rejects(
      service.approve(undefined, 'reviewed-request', reviewedRevision, 'Review of the displayed request and evidence.'),
      ConflictException
    );
    assert.equal(queries.length, 3);
    assert.equal(queries.some((sql) => /UPDATE\s+verification_requests|UPDATE\s+professional_profiles|INSERT\s+INTO\s+trust_history/i.test(sql)), false);
  });
}
