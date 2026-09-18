import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { AdService } from './ad.service';
import type { AdRepository } from './ad.repository';
import type { IdentityService } from '../identity/identity.service';
import type { OperationsRbacService } from '../operations-product/operations-rbac.service';
import type { AdListing } from './ad.types';

const sampleAd = (): AdListing => ({
  id: 'ad-1', ownerUserId: 'user-1', kind: 'sale', titleAr: 'إعلان', categoryCode: 'home_services',
  priceMode: 'none', contactMode: 'profile', status: 'active', imageUrls: [], createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(), revision: 4, contentRevision: 3, reviewRevision: 2
});

function makeService(repositoryOverrides: Partial<AdRepository> = {}) {
  const repository = {
    listPublic: async () => [sampleAd()],
    countPublic: async () => 1,
    findPublicById: async () => sampleAd(),
    create: async () => sampleAd(),
    ...repositoryOverrides
  } as unknown as AdRepository;
  const identity = { getCurrentUser: async () => ({ id: 'user-1', email: 'owner@example.com' }) } as unknown as IdentityService;
  const rbac = { assert: () => undefined } as unknown as OperationsRbacService;
  return new AdService(repository, identity, rbac);
}

async function withFlag<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.CLASSIFIEDS_ENABLED;
  if (value === undefined) delete process.env.CLASSIFIEDS_ENABLED;
  else process.env.CLASSIFIEDS_ENABLED = value;
  try { return await fn(); }
  finally {
    if (previous === undefined) delete process.env.CLASSIFIEDS_ENABLED;
    else process.env.CLASSIFIEDS_ENABLED = previous;
  }
}

test('classifieds is fail-closed unless CLASSIFIEDS_ENABLED is exactly true', async () => {
  const service = makeService();
  await assert.rejects(() => withFlag(undefined, () => service.listPublic({})), ServiceUnavailableException);
  await assert.rejects(() => withFlag('TRUE', () => service.listPublic({})), ServiceUnavailableException);
});

test('enabled classifieds maps missing schema to service unavailable instead of leaking database errors', async () => {
  const service = makeService({ listPublic: async () => { throw { code: '42P01', message: 'relation ad_listings does not exist' }; } });
  await assert.rejects(() => withFlag('true', () => service.listPublic({})), ServiceUnavailableException);
});

test('public projection removes authority fields and returns server-owned pagination', async () => {
  let capturedLimit = 0;
  let capturedOffset = 0;
  const service = makeService({
    listPublic: async (_filters, limit, offset) => { capturedLimit = limit; capturedOffset = offset; return [sampleAd()]; },
    countPublic: async () => 41
  });
  const result = await withFlag('true', () => service.listPublic({ page: '2' }));
  const [ad] = result.ads;
  assert.equal('ownerUserId' in ad, false);
  assert.equal('revision' in ad, false);
  assert.equal('contentRevision' in ad, false);
  assert.equal('reviewRevision' in ad, false);
  assert.equal('rejectionReason' in ad, false);
  assert.equal(ad.id, 'ad-1');
  assert.equal(result.page, 2);
  assert.equal(result.total, 41);
  assert.equal(capturedLimit, 20);
  assert.equal(capturedOffset, 20);
});

test('create derives deterministic identity from actor and request key', async () => {
  let capturedId = '';
  const service = makeService({
    create: async (_owner, id) => { capturedId = id; return { ...sampleAd(), id, status: 'draft' }; }
  });
  const body = {
    clientRequestId: 'classifieds-request-0001', kind: 'sale', titleAr: 'إعلان مستقل', categoryCode: 'home_services',
    priceMode: 'none', contactMode: 'profile'
  };
  const first = await withFlag('true', () => service.create('sid=fake', body));
  const firstId = capturedId;
  const second = await withFlag('true', () => service.create('sid=fake', body));
  assert.equal(capturedId, firstId);
  assert.equal(first.id, second.id);
  assert.match(firstId, /^[a-f0-9]{64}$/);
});
