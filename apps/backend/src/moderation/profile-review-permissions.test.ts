import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabasePool } from '../database/database.pool';
import { BusinessProfileService } from '../business-profiles/business-profile.service';
import { ProfessionalProfileService } from '../professional-profiles/professional-profile.service';
import { writeProfileReview } from './profile-review-write';

const revision = '2026-10-20T12:00:00.123456Z';

for (const kind of ['business', 'professional'] as const) {
  test(`${kind} reviewer cannot approve their own profile even when RBAC already authorized the route`, async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [{ owner_id: 'same-user', moderation_status: 'pending', lifecycle: 'active', trust_status: 'pending', revision }], rowCount: 1 };
      }
    } as unknown as PoolClient;
    const db = {
      transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
    } as unknown as DatabasePool;

    await assert.rejects(
      () => writeProfileReview(db, kind, 'profile-1', 'same-user', { status: 'approved', expectedRevision: revision }),
      ForbiddenException
    );
    assert.equal(queries.length, 1);
    assert.match(queries[0], /FOR UPDATE/);
  });
}

for (const categoryCode of ['taxi', 'delivery_courier'] as const) {
  test(`${categoryCode} profile approval requires all four latest mobility documents to be approved`, async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM business_profiles') && sql.includes('FOR UPDATE')) {
          return { rows: [{
            owner_id: 'owner', moderation_status: 'pending', lifecycle: 'active', trust_status: 'approved',
            category_code: categoryCode, revision
          }], rowCount: 1 };
        }
        if (sql.includes('WITH latest_documents')) {
          return { rows: [{ total: 4, approved: 3 }], rowCount: 1 };
        }
        throw new Error(`Mobility profile approval attempted a write without complete documents: ${sql}`);
      }
    } as unknown as PoolClient;
    const db = {
      transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
    } as unknown as DatabasePool;

    await assert.rejects(
      writeProfileReview(db, 'business', 'profile-1', 'reviewer', { status: 'approved', expectedRevision: revision }),
      ConflictException
    );
    assert.equal(statements.some((sql) => /UPDATE\s+business_profiles/i.test(sql)), false);
    assert.equal(statements.some((sql) => /INSERT\s+INTO\s+trust_history/i.test(sql)), false);
  });
}

test('mobility profile approval proceeds when all four latest documents are approved', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('FROM business_profiles') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          owner_id: 'owner', moderation_status: 'pending', lifecycle: 'active', trust_status: 'approved',
          category_code: 'taxi', revision
        }], rowCount: 1 };
      }
      if (sql.includes('WITH latest_documents')) return { rows: [{ total: 4, approved: 4 }], rowCount: 1 };
      if (/UPDATE\s+business_profiles/i.test(sql) || /INSERT\s+INTO\s+trust_history/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  } as unknown as PoolClient;
  const db = {
    transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
  } as unknown as DatabasePool;

  await writeProfileReview(db, 'business', 'profile-1', 'reviewer', { status: 'approved', expectedRevision: revision });
  assert.equal(statements.some((sql) => /UPDATE\s+business_profiles/i.test(sql)), true);
  assert.equal(statements.some((sql) => /INSERT\s+INTO\s+trust_history/i.test(sql)), true);
});

test('non-mobility profile approval does not require driver documents', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('FROM business_profiles') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          owner_id: 'owner', moderation_status: 'pending', lifecycle: 'active', trust_status: 'approved',
          category_code: 'restaurant', revision
        }], rowCount: 1 };
      }
      if (/UPDATE\s+business_profiles/i.test(sql) || /INSERT\s+INTO\s+trust_history/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  } as unknown as PoolClient;
  const db = {
    transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
  } as unknown as DatabasePool;

  await writeProfileReview(db, 'business', 'profile-1', 'reviewer', { status: 'approved', expectedRevision: revision });
  assert.equal(statements.some((sql) => sql.includes('WITH latest_documents')), false);
});

for (const kind of ['business', 'professional'] as const) {
  test(`${kind} bounded content authority can approve but cannot reject`, async () => {
    const actor = { id: 'reviewer', email: 'reviewer@example.test' };
    const permissionChecks: string[][] = [];
    let reviews = 0;
    const profile = kind === 'business'
      ? {
          id: 'profile-1', ownerUserId: 'owner', name: 'Business', visibility: 'private', moderationStatus: 'pending',
          trustStatus: 'pending', status: 'active', categoryCode: 'services', cityCode: 'damascus', countryCode: 'SY',
          isFeatured: false, createdAt: revision
        }
      : {
          id: 'profile-1', userId: 'owner', headlineAr: 'Professional', cityCode: 'damascus', countryCode: 'SY',
          skills: [], isFeatured: false, createdAt: revision
        };
    const repository = {
      review: async () => { reviews += 1; },
      findById: async () => profile
    };
    const rbac = {
      assertAny: (_email: string, permissions: readonly string[]) => { permissionChecks.push([...permissions]); },
      assert: () => { throw new ForbiddenException('security.manage required'); }
    };
    const identity = { getCurrentUser: async () => actor };
    const service = kind === 'business'
      ? new BusinessProfileService(repository as never, identity as never, rbac as never, {} as never)
      : new ProfessionalProfileService(repository as never, identity as never, rbac as never);

    await service.approveModeration(undefined, 'profile-1', revision);
    await assert.rejects(
      service.rejectModeration(undefined, 'profile-1', 'Content violates policy.', revision),
      ForbiddenException
    );
    assert.equal(reviews, 1);
    assert.deepEqual(permissionChecks, [['security.manage', 'content.approvals.approve']]);
  });
}
