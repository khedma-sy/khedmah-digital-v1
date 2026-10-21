import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabasePool } from '../database/database.pool';
import { AdRepository } from './ad.repository';

test('a reviewer cannot approve their own classified ad under a delegated approval role', async () => {
  const now = new Date('2026-10-20T12:00:00.000Z');
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      return {
        rows: [{
          id: 'ad-1', owner_user_id: 'same-user', business_profile_id: null, kind: 'sale', title_ar: 'سيارة',
          description_ar: null, category_code: 'cars', price_mode: 'none', price_minor: null, currency: null,
          city_code: 'damascus', area_text: null, contact_mode: 'phone', contact_value: '0912345678',
          status: 'pending_review', rejection_reason: null, revision: 2, content_revision: 1, review_revision: 1,
          expires_at: null, submitted_at: now, created_at: now, updated_at: now, image_urls: []
        }],
        rowCount: 1
      };
    }
  } as unknown as PoolClient;
  const db = {
    transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
  } as unknown as DatabasePool;

  await assert.rejects(
    () => new AdRepository(db).moderate('same-user', 'ad-1', 1, 'approved'),
    ForbiddenException
  );
  assert.equal(queries.length, 2);
  assert.match(queries[0], /FOR UPDATE/);
  assert.equal(queries.some((sql) => sql.startsWith('UPDATE ad_listings') || sql.includes('INSERT INTO ad_moderation_events')), false);
});
