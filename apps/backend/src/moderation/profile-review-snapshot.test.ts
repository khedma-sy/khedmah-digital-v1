import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { BusinessProfileService } from '../business-profiles/business-profile.service';
import type { BusinessProfileModerationRecord } from '../business-profiles/business-profile.types';
import { ProfessionalProfileRepository } from '../professional-profiles/professional-profile.repository';
import { ProfessionalProfileService } from '../professional-profiles/professional-profile.service';
import type { ProfessionalProfileModerationRecord } from '../professional-profiles/professional-profile.types';

const exactRevision = '2026-10-20T12:00:00.123456Z';
const createdAt = new Date('2026-10-20T10:00:00.000Z');
const updatedAt = new Date('2026-10-20T12:00:00.123Z');

const serviceListing = {
  id: 'service-1', ownerType: 'business', ownerId: 'business-1', titleAr: 'صيانة',
  descriptionAr: 'وصف كامل للمراجع', categoryCode: 'maintenance', price: 150,
  priceCurrency: 'SYP', priceType: 'fixed', status: 'active', isFeatured: false,
  createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString()
} as const;

test('business moderation repository returns one revision-bound aggregate of every publishable child', async () => {
  let sql = '';
  const db = { query: async (statement: string) => {
    sql = statement;
    return [{
      id: 'business-1', name: 'ورشة', description_ar: 'وصف النشاط', description_en: null,
      owner_user_id: 'owner-1', organization_id: null, visibility: 'private', moderation_status: 'pending',
      trust_status: 'pending', status: 'active', phone: null, email: null, website: null,
      category_code: 'maintenance', category_name_ar: 'الصيانة', city_code: 'damascus', country_code: 'SY',
      lat: null, lng: null, address_ar: null, is_featured: false, featured_at: null,
      created_at: createdAt, updated_at: updatedAt, revision: exactRevision, content_revision: 'content-revision',
      review_image_urls: ['https://cdn.example.test/business.jpg'],
      review_service_listings: [serviceListing],
      review_opening_hours: [{ id: 'hours-1', businessProfileId: 'business-1', dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false }],
      review_branches: [{ id: 'branch-1', businessProfileId: 'business-1', nameAr: 'الفرع الرئيسي', cityCode: 'damascus', isMain: true }],
      review_social_links: [{ id: 'social-1', businessProfileId: 'business-1', platform: 'instagram', url: 'https://instagram.com/example' }]
    }];
  } };

  const [record] = await new BusinessProfileRepository(db as never).listPendingModeration();
  assert.equal(record.revision, exactRevision);
  assert.equal(record.reviewSnapshot.exactRevision, record.revision);
  assert.equal(record.reviewSnapshot.serviceListings[0]?.descriptionAr, 'وصف كامل للمراجع');
  assert.equal(record.reviewSnapshot.serviceListings[0]?.price, 150);
  assert.equal(record.reviewSnapshot.serviceListings[0]?.priceCurrency, 'SYP');
  assert.equal(record.reviewSnapshot.serviceListings[0]?.priceType, 'fixed');
  assert.equal(record.reviewSnapshot.serviceListings[0]?.status, 'active');
  assert.equal(record.reviewSnapshot.openingHours[0]?.dayOfWeek, 1);
  assert.equal(record.reviewSnapshot.branches[0]?.nameAr, 'الفرع الرئيسي');
  assert.equal(record.reviewSnapshot.socialLinks[0]?.platform, 'instagram');
  assert.deepEqual(record.reviewSnapshot.reviewImageUrls, ['https://cdn.example.test/business.jpg']);
  assert.match(sql, /FROM service_listings sl WHERE sl\.owner_type='business'/);
  assert.match(sql, /FROM business_opening_hours/);
  assert.match(sql, /FROM business_branches/);
  assert.match(sql, /FROM business_social_links/);
});

test('professional moderation repository includes complete service content in the same parent revision snapshot', async () => {
  let sql = '';
  const professionalService = { ...serviceListing, ownerType: 'professional', ownerId: 'professional-1' } as const;
  const db = { query: async (statement: string) => {
    sql = statement;
    return [{
      id: 'professional-1', user_id: 'owner-2', headline_ar: 'فني', headline_en: null,
      bio_ar: 'سيرة', bio_en: null, availability: 'available', city_code: 'damascus', country_code: 'SY',
      skills: ['صيانة'], is_featured: false, featured_at: null, created_at: createdAt, updated_at: updatedAt,
      revision: exactRevision, content_revision: 'content-revision',
      review_image_urls: ['https://cdn.example.test/professional.jpg'], review_service_listings: [professionalService]
    }];
  } };

  const [record] = await new ProfessionalProfileRepository(db as never).listPendingModeration();
  assert.equal(record.reviewSnapshot.exactRevision, record.revision);
  assert.deepEqual(record.reviewSnapshot.reviewImageUrls, ['https://cdn.example.test/professional.jpg']);
  assert.equal(record.reviewSnapshot.serviceListings[0]?.ownerType, 'professional');
  assert.equal(record.reviewSnapshot.serviceListings[0]?.descriptionAr, 'وصف كامل للمراجع');
  assert.equal(record.reviewSnapshot.serviceListings[0]?.price, 150);
  assert.equal(record.reviewSnapshot.serviceListings[0]?.status, 'active');
  assert.match(sql, /FROM service_listings sl WHERE sl\.owner_type='professional'/);
});

function businessRecord(): BusinessProfileModerationRecord {
  return {
    id: 'business-1', name: 'ورشة', ownerUserId: 'owner-1', visibility: 'private', moderationStatus: 'pending',
    trustStatus: 'pending', status: 'active', categoryCode: 'maintenance', cityCode: 'damascus', countryCode: 'SY',
    isFeatured: false, revision: exactRevision, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
    reviewImageUrls: ['https://cdn.example.test/business.jpg'],
    reviewSnapshot: {
      exactRevision, reviewImageUrls: ['https://cdn.example.test/business.jpg'], serviceListings: [serviceListing],
      openingHours: [], branches: [], socialLinks: []
    }
  };
}

function professionalRecord(): ProfessionalProfileModerationRecord {
  return {
    id: 'professional-1', userId: 'owner-2', headlineAr: 'فني', availability: 'available', cityCode: 'damascus',
    countryCode: 'SY', skills: [], isFeatured: false, revision: exactRevision,
    createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
    reviewSnapshot: {
      exactRevision, reviewImageUrls: ['https://cdn.example.test/professional.jpg'],
      serviceListings: [{ ...serviceListing, ownerType: 'professional', ownerId: 'professional-1' }]
    }
  };
}

for (const kind of ['business', 'professional'] as const) {
  test(`${kind} aggregate queue is returned to content reviewer and is not read for a non-reviewer`, async () => {
    let queueReads = 0;
    let allowed = true;
    const record = kind === 'business' ? businessRecord() : professionalRecord();
    const repository = {
      listPendingModeration: async () => { queueReads += 1; return [record]; }
    };
    const identity = { getCurrentUser: async () => ({ id: 'reviewer', email: 'reviewer@example.test' }) };
    const rbac = { assertAny: () => { if (!allowed) throw new ForbiddenException('review permission required'); } };
    const service = kind === 'business'
      ? new BusinessProfileService(repository as never, identity as never, rbac as never, {} as never)
      : new ProfessionalProfileService(repository as never, identity as never, rbac as never);

    const [visible] = await service.listPendingModeration(undefined);
    assert.equal(visible.reviewSnapshot.exactRevision, exactRevision);
    assert.equal(visible.reviewSnapshot.serviceListings[0]?.descriptionAr, 'وصف كامل للمراجع');
    assert.equal(queueReads, 1);

    allowed = false;
    await assert.rejects(service.listPendingModeration(undefined), ForbiddenException);
    assert.equal(queueReads, 1, 'child aggregate must not be queried before reviewer authorization');
  });
}

test('public business mapping never forwards a reviewer-only aggregate', async () => {
  const source = { ...businessRecord(), visibility: 'public', moderationStatus: 'approved', trustStatus: 'approved' } as const;
  const service = new BusinessProfileService(
    { findById: async () => source } as never,
    {} as never,
    {} as never,
    {} as never
  );
  const response = await service.getPublic(source.id);
  assert.equal('reviewSnapshot' in response, false);
});

test('public professional mapping never forwards a reviewer-only aggregate', async () => {
  const source = professionalRecord();
  const service = new ProfessionalProfileService(
    {
      findById: async () => source,
      findContactEligibility: async () => ({ visibility: 'public', moderationStatus: 'approved', lifecycleStatus: 'active' })
    } as never,
    {} as never,
    {} as never
  );
  const response = await service.getProfile(source.id);
  assert.equal('reviewSnapshot' in response, false);
});
