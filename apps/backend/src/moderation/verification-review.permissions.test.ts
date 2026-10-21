import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabasePool } from '../database/database.pool';
import { VerificationReviewService } from './verification-review.service';

const revision = '2026-10-20T12:00:00.000000Z';

test('bounded trust approver can read the verification queue but cannot reject', async () => {
  const calls: string[] = [];
  const db = {
    query: async () => [],
    transaction: async () => { calls.push('transaction'); throw new Error('transaction must not run'); }
  } as unknown as DatabasePool;
  const identity = { getCurrentUser: async () => ({ id: 'reviewer', email: 'reviewer@example.test' }) } as any;
  const rbac = {
    assertAny: (_email: string, permissions: string[]) => { calls.push(`any:${permissions.join(',')}`); },
    assert: (_email: string, permission: string) => { calls.push(`exact:${permission}`); throw new ForbiddenException(); }
  } as any;
  const service = new VerificationReviewService(db, identity, rbac);

  assert.deepEqual(await service.listPending(undefined), []);
  await assert.rejects(
    service.reject(undefined, 'request-1', revision, 'Only security operations may reject verification.'),
    ForbiddenException
  );
  assert.deepEqual(calls, [
    'any:security.manage,trust.approvals.approve',
    'exact:security.manage'
  ]);
});

test('verification queue projects bounded evidence and reviewer summary without owner identifiers', async () => {
  const db = {
    query: async (query: string) => {
      assert.match(query, /LIMIT 4/);
      return [{
        request_id: 'request-1', entity_type: 'business', entity_id: 'business-1', label: 'نشاط',
        profile_revision: revision, request_created_at: new Date('2026-10-20T12:00:00.000Z'),
        profile_summary: { entityType: 'business', name: 'نشاط', categoryCode: 'retail', cityCode: 'damascus' },
        evidence: [{ id: 'proof-1', filename: 'proof.png', mimeType: 'image/png', sizeBytes: 8, createdAt: revision }]
      }];
    }
  } as unknown as DatabasePool;
  const service = new VerificationReviewService(
    db,
    { getCurrentUser: async () => ({ id: 'reviewer', email: 'reviewer@example.test' }) } as any,
    { assertAny: () => undefined, assert: () => undefined } as any
  );

  const [item] = await service.listPending(undefined);
  assert.equal(item.evidence[0].secureUrl, '/api/v1/media/public/proof-1');
  assert.deepEqual(item.profileSummary, { entityType: 'business', name: 'نشاط', categoryCode: 'retail', cityCode: 'damascus' });
  assert.equal('ownerUserId' in item.profileSummary, false);
  assert.equal('owner_user_id' in item.profileSummary, false);
});

test('bounded trust approver cannot approve their own verification request', async () => {
  const sql: string[] = [];
  const client = {
    query: async (query: string) => {
      sql.push(query);
      if (query.includes('SELECT entity_type,entity_id FROM verification_requests')) {
        return { rows: [{ entity_type: 'business', entity_id: 'business-1' }], rowCount: 1 };
      }
      if (query.includes('FROM business_profiles')) {
        return { rows: [{
          label: 'نشاط', owner_user_id: 'same-user', trust_status: 'pending', moderation_status: 'approved',
          status: 'active', lifecycle_status: null, revision
        }], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${query}`);
    }
  } as unknown as PoolClient;
  const db = {
    transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
  } as unknown as DatabasePool;
  const service = new VerificationReviewService(
    db,
    { getCurrentUser: async () => ({ id: 'same-user', email: 'reviewer@example.test' }) } as any,
    { assertAny: () => undefined, assert: () => undefined } as any
  );

  await assert.rejects(
    service.approve(undefined, 'request-1', revision, 'Reviewed evidence cannot belong to the reviewer.'),
    ForbiddenException
  );
  assert.equal(sql.some((query) => query.includes('UPDATE verification_requests')), false);
});

for (const evidenceCount of [0, 4]) test(`verification approval fails closed with ${evidenceCount} current private evidence images`, async () => {
  const sql: string[] = [];
  const client = {
    query: async (query: string) => {
      sql.push(query);
      if (query.includes('SELECT entity_type,entity_id FROM verification_requests')) {
        return { rows: [{ entity_type: 'business', entity_id: 'business-1' }], rowCount: 1 };
      }
      if (query.includes('FROM business_profiles')) {
        return { rows: [{
          label: 'نشاط', owner_user_id: 'owner', trust_status: 'pending', moderation_status: 'approved',
          status: 'active', lifecycle_status: null, revision,
          profile_summary: { entityType: 'business', name: 'نشاط', categoryCode: 'retail', cityCode: 'damascus' }
        }], rowCount: 1 };
      }
      if (query.includes('SELECT id,status,created_at FROM verification_requests')) {
        return { rows: [{ id: 'request-1', status: 'pending', created_at: new Date() }], rowCount: 1 };
      }
      if (query.includes('SELECT id,filename,mime_type,size_bytes,created_at FROM media_assets')) {
        const rows = Array.from({ length: evidenceCount }, (_, index) => ({
          id: `proof-${index}`, filename: `proof-${index}.png`, mime_type: 'image/png', size_bytes: 8,
          created_at: new Date('2026-10-20T12:00:00.000Z')
        }));
        return { rows, rowCount: rows.length };
      }
      throw new Error(`unexpected query: ${query}`);
    }
  } as unknown as PoolClient;
  const service = new VerificationReviewService(
    { transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client) } as unknown as DatabasePool,
    { getCurrentUser: async () => ({ id: 'reviewer', email: 'reviewer@example.test' }) } as any,
    { assertAny: () => undefined, assert: () => undefined } as any
  );
  await assert.rejects(
    service.approve(undefined, 'request-1', revision, 'Reviewed all current evidence images.'),
    ConflictException
  );
  assert.equal(sql.some((query) => query.includes('UPDATE verification_requests')), false);
});
