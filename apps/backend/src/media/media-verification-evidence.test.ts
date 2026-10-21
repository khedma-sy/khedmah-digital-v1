import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { ProfessionalProfileRepository } from '../professional-profiles/professional-profile.repository';
import { MediaService } from './media.service';
import { validateUploadMediaRequest } from './media.validation';

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const upload = {
  ownerType: 'business_profile' as const,
  ownerId: 'business-1',
  assetType: 'business_verification_evidence' as const,
  visibility: 'private' as const,
  filename: 'proof.png',
  mimeType: 'image/png' as const,
  sizeBytes: png.length,
  content: png.toString('base64')
};

test('verification evidence validation is private and bound to its matching profile type', () => {
  assert.equal(validateUploadMediaRequest(upload).assetType, 'business_verification_evidence');
  assert.throws(
    () => validateUploadMediaRequest({ ...upload, visibility: 'public' }),
    BadRequestException
  );
  assert.throws(
    () => validateUploadMediaRequest({ ...upload, ownerType: 'professional_profile' }),
    BadRequestException
  );
  assert.throws(
    () => validateUploadMediaRequest({
      ...upload,
      ownerType: 'business_profile',
      assetType: 'professional_verification_evidence'
    }),
    BadRequestException
  );
});

function mediaFixture(existingEvidence: number, invalidateApproved = false, kind: 'business' | 'professional' = 'business') {
  const statements: string[] = [];
  let saves = 0;
  let deletes = 0;
  const existing = Array.from({ length: existingEvidence }, (_, index) => ({ id: `evidence-${index}`, storage_key: `key-${index}` }));
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes(`AS owner_user_id FROM ${kind === 'business' ? 'business_profiles' : 'professional_profiles'}`)) {
        return { rows: [{ owner_user_id: 'owner' }], rowCount: 1 };
      }
      if (sql.includes('SELECT storage_key,asset_type FROM media_assets')) return {
        rows: [{ storage_key: 'key-0', asset_type: kind === 'business' ? 'business_verification_evidence' : 'professional_verification_evidence' }],
        rowCount: 1
      };
      if (sql.includes('SELECT id,storage_key FROM media_assets')) return { rows: existing, rowCount: existing.length };
      if (sql.startsWith('SELECT id,status FROM verification_requests')) return { rows: invalidateApproved ? [{ id: 'approved-request', status: 'approved' }] : [], rowCount: invalidateApproved ? 1 : 0 };
      return { rows: [], rowCount: 1 };
    }
  } as unknown as PoolClient;
  const db = {
    query: async (sql: string) => {
      if (sql.includes('SELECT owner_user_id, storage_key, owner_type, owner_id, asset_type')) return [{
        owner_user_id: 'owner', storage_key: 'key-0',
        owner_type: kind === 'business' ? 'business_profile' : 'professional_profile',
        owner_id: kind === 'business' ? 'business-1' : 'professional-1',
        asset_type: kind === 'business' ? 'business_verification_evidence' : 'professional_verification_evidence'
      }];
      if (sql.includes('AS owner_user_id')) return [{ owner_user_id: 'owner' }];
      if (sql.includes('SELECT id, storage_key FROM media_assets')) return existing;
      return [];
    },
    transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client)
  };
  const service = new MediaService(
    db as any,
    { getCurrentUser: async () => ({ id: 'owner', email: 'owner@example.test' }) } as any,
    { assertAny: () => undefined } as any
  );
  Object.defineProperty(service, 'storage', { value: {
    save: async () => { saves += 1; },
    delete: async () => { deletes += 1; }
  } });
  return { service, statements, get saves() { return saves; }, get deletes() { return deletes; } };
}

test('verification evidence is capped at three inside the profile transaction', async () => {
  const fixture = mediaFixture(3);
  await assert.rejects(() => fixture.service.upload(undefined, upload), BadRequestException);
  assert.equal(fixture.saves, 1);
  assert.equal(fixture.deletes, 1);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO media_assets')), false);
});

test('evidence mutation invalidates verification without resetting content moderation', async () => {
  const fixture = mediaFixture(0, true);
  await fixture.service.upload(undefined, upload);
  assert.equal(fixture.statements.some((sql) => /SET moderation_status=/.test(sql)), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO verification_requests')), true);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('UPDATE verification_requests')), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO trust_history')), true);
  assert.equal(fixture.statements.some((sql) => /SET trust_status=CASE/.test(sql)), true);
});

test('professional evidence mutation reopens human verification without changing content moderation', async () => {
  const fixture = mediaFixture(0, true, 'professional');
  await fixture.service.upload(undefined, {
    ...upload,
    ownerType: 'professional_profile',
    ownerId: 'professional-1',
    assetType: 'professional_verification_evidence'
  });
  assert.equal(fixture.statements.some((sql) => /SET moderation_status=/.test(sql)), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO verification_requests')), true);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('UPDATE verification_requests')), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO trust_history')), true);
  assert.equal(fixture.statements.some((sql) => /SET trust_status=CASE/.test(sql)), false);
});

test('deleting approved evidence creates a new pending review without rewriting content moderation', async () => {
  const fixture = mediaFixture(1, true);
  await fixture.service.delete(undefined, 'evidence-0');
  assert.equal(fixture.statements.some((sql) => /SET moderation_status=/.test(sql)), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO verification_requests')), true);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('UPDATE verification_requests')), false);
  assert.equal(fixture.statements.some((sql) => sql.startsWith('INSERT INTO trust_history')), true);
  assert.equal(fixture.deletes, 1);
});

for (const [kind, Repository, parentSql] of [
  ['business', BusinessProfileRepository, 'business_profiles'],
  ['professional', ProfessionalProfileRepository, 'professional_profiles']
] as const) {
  for (const evidenceCount of [0, 4]) test(`${kind} verification request fails closed with ${evidenceCount} private evidence images`, async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes(`FROM ${parentSql}`)) {
          return { rows: [kind === 'business' ? { owner_user_id: 'owner' } : { user_identifier: 'owner' }], rowCount: 1 };
        }
        if (sql.includes('count(*)::int AS count FROM media_assets')) return { rows: [{ count: evidenceCount }], rowCount: 1 };
        throw new Error(`unexpected query: ${sql}`);
      }
    } as unknown as PoolClient;
    const repository = new Repository({ transaction: async <T>(work: (value: PoolClient) => Promise<T>) => work(client) } as any);
    await assert.rejects(
      () => repository.requestVerification({
        id: 'request-1', entityType: kind, entityId: `${kind}-1`, requesterId: 'owner', status: 'pending',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      } as any),
      BadRequestException
    );
    assert.equal(statements.some((sql) => sql.startsWith('INSERT INTO verification_requests')), false);
  });
}
