import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient, QueryResult } from 'pg';
import type { DatabasePool } from '../database/database.pool';
import { AdRepository } from './ad.repository';

const now = new Date('2026-10-20T12:00:00.000Z');

function adRow(status: 'draft' | 'pending_review' = 'draft') {
  return {
    id: 'ad-1', owner_user_id: 'owner-1', business_profile_id: null, kind: 'sale', title_ar: 'سيارة',
    description_ar: null, category_code: 'cars', price_mode: 'none', price_minor: null, currency: null,
    city_code: 'damascus', area_text: null, contact_mode: 'phone', contact_value: '0912345678', status,
    rejection_reason: null, revision: status === 'draft' ? 1 : 2, content_revision: 1,
    review_revision: status === 'draft' ? 0 : 1, expires_at: null,
    submitted_at: status === 'draft' ? null : now, created_at: now, updated_at: now, image_urls: []
  };
}

const result = (rows: Record<string, unknown>[] = [], rowCount = rows.length) => ({ rows, rowCount }) as QueryResult;

test('owner submission enters pending review, increments the review revision, and does not reserve quota', async () => {
  const row = adRow();
  const queries: string[] = [];
  let receipt: Record<string, unknown> | undefined;
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push(sql);
      if (sql.includes('FROM ad_listings a WHERE a.id=$1')) return result([{ ...row }]);
      if (sql.includes('FROM ad_request_receipts')) return result(receipt ? [receipt] : []);
      if (sql.startsWith('UPDATE ad_listings SET status=')) {
        assert.match(sql, /status='pending_review'/);
        assert.match(sql, /review_revision=review_revision\+1/);
        row.status = 'pending_review'; row.revision = 2; row.review_revision = 1; row.submitted_at = now;
        return result([], 1);
      }
      if (sql.startsWith('INSERT INTO ad_request_receipts')) {
        receipt = { request_fingerprint: 'fingerprint', ad_id: 'ad-1', result_revision: 2 };
        return result([], 1);
      }
      return result([], 1);
    }
  } as unknown as PoolClient;
  const db = { transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client) } as unknown as DatabasePool;

  const ad = await new AdRepository(db).submit('owner-1', 'ad-1', 'request-00000001', 'fingerprint', 1);

  assert.equal(ad.status, 'pending_review');
  assert.equal(ad.reviewRevision, 1);
  assert.equal(queries.some((sql) => sql.includes('ad_free_slots')), false);
  assert.equal(queries.some((sql) => /SET status='active'/.test(sql)), false);
});

test('human approval reserves or reuses the per-ad quota slot before activation and rejection reserves none', async () => {
  async function decide(decision: 'approved' | 'rejected', existingSlot = false) {
    const row = adRow('pending_review');
    const queries: string[] = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push(sql);
        if (sql.includes('FROM ad_listings a WHERE a.id=$1')) return result([{ ...row }]);
        if (sql.startsWith('SELECT ad_id FROM ad_free_slots')) return result(existingSlot ? [{ ad_id: 'ad-1' }] : []);
        if (sql.startsWith('INSERT INTO ad_free_slots')) {
          assert.deepEqual(params, ['ad-1', 'owner-1']);
          return result([], 1);
        }
        if (sql.startsWith('UPDATE ad_listings SET status=$2')) {
          (row as { status: string }).status = String(params?.[1]); row.revision = 3;
          return result([], 1);
        }
        return result([], 1);
      }
    } as unknown as PoolClient;
    const db = { transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client) } as unknown as DatabasePool;
    const ad = await new AdRepository(db).moderate('reviewer-1', 'ad-1', 1, decision, decision === 'rejected' ? 'سبب واضح' : undefined);
    return { ad, queries };
  }

  const approved = await decide('approved');
  assert.equal(approved.ad.status, 'active');
  assert.ok(approved.queries.findIndex((sql) => sql.startsWith('INSERT INTO ad_free_slots'))
    < approved.queries.findIndex((sql) => sql.startsWith('UPDATE ad_listings SET status=$2')));

  const approvedAgain = await decide('approved', true);
  assert.equal(approvedAgain.ad.status, 'active');
  assert.equal(approvedAgain.queries.some((sql) => sql.startsWith('INSERT INTO ad_free_slots')), false);

  const rejected = await decide('rejected');
  assert.equal(rejected.ad.status, 'rejected');
  assert.equal(rejected.queries.some((sql) => sql.includes('ad_free_slots')), false);
});
