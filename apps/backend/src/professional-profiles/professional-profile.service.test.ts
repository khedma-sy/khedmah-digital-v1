import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { ProfessionalProfileService } from './professional-profile.service';
import type { ProfessionalProfileRepository } from './professional-profile.repository';
import type { IdentityService } from '../identity/identity.service';
import type { OperationsRbacService } from '../operations-product/operations-rbac.service';
import type { ProfessionalProfile } from './professional-profile.types';

const profile: ProfessionalProfile = {
  id: 'professional_profile_test',
  userId: 'user_test',
  headlineAr: 'مهندس برمجيات',
  headlineEn: 'Software Engineer',
  bioAr: 'نبذة عامة',
  bioEn: 'Public bio',
  availability: 'available',
  cityCode: 'damascus',
  countryCode: 'sy',
  skills: ['typescript'],
  isFeatured: false,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z'
};

type Eligibility = {
  visibility: 'public' | 'private' | 'internal';
  moderationStatus: 'approved' | 'pending' | 'rejected' | 'suspended';
  lifecycleStatus: 'created' | 'pending' | 'active' | 'suspended' | 'archived';
};

function createService(
  eligibility: Eligibility | undefined,
  counters: {
    media: number;
    verification: number;
    trust: number;
  } = { media: 0, verification: 0, trust: 0 },
  verificationRequest?: any,
  actorId = 'user_test'
): ProfessionalProfileService {
  const repository = {
    findById: async () => profile,
    findContactEligibility: async () => eligibility,

    listMediaAssets: async () => {
      counters.media += 1;
      return [];
    },

    findVerificationRequest: async () => {
      counters.verification += 1;
      return verificationRequest;
    },

    listTrustHistory: async () => {
      counters.trust += 1;
      return [];
    }
  } as unknown as ProfessionalProfileRepository;

  const identity = {
    getCurrentUser: async () => ({
      id: actorId,
      email: 'owner@example.com'
    }),
    getSession: async (token: string | undefined) => token ? ({ id: actorId, email: 'owner@example.com' }) : undefined
  } as unknown as IdentityService;

  const rbac = {
    permissionsFor: () => [],
    assert: () => []
  } as unknown as OperationsRbacService;

  return new ProfessionalProfileService(repository, identity, rbac);
}

async function assertNotPublic(
  eligibility: Eligibility,
  label: string
): Promise<void> {
  const counters = {
    media: 0,
    verification: 0,
    trust: 0
  };

  const service = createService(eligibility, counters);

  await assert.rejects(
    () => service.getProfile(profile.id),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.getStatus() === 404,
    `${label}: detail must fail closed`
  );

  await assert.rejects(
    () => service.getMediaAssets(undefined, profile.id),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.getStatus() === 404,
    `${label}: media must fail closed`
  );

  await assert.rejects(
    () => service.getVerificationStatus(undefined, profile.id),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.getStatus() === 404,
    `${label}: verification status must fail closed`
  );

  await assert.rejects(
    () => service.getTrustHistory(undefined, profile.id),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.getStatus() === 404,
    `${label}: trust history must fail closed`
  );

  assert.deepEqual(
    counters,
    { media: 0, verification: 0, trust: 0 },
    `${label}: auxiliary repositories must not be queried`
  );
}

test('public professional detail and auxiliary resources require public approved active eligibility', async () => {
  await assertNotPublic(
    {
      visibility: 'private',
      moderationStatus: 'approved',
      lifecycleStatus: 'active'
    },
    'private'
  );

  await assertNotPublic(
    {
      visibility: 'public',
      moderationStatus: 'pending',
      lifecycleStatus: 'active'
    },
    'pending'
  );

  await assertNotPublic(
    {
      visibility: 'public',
      moderationStatus: 'rejected',
      lifecycleStatus: 'active'
    },
    'rejected'
  );

  await assertNotPublic(
    {
      visibility: 'public',
      moderationStatus: 'approved',
      lifecycleStatus: 'suspended'
    },
    'suspended'
  );
});

test('missing eligibility fails closed for public professional reads', async () => {
  const service = createService(undefined);

  await assert.rejects(
    () => service.getProfile(profile.id),
    NotFoundException
  );
});

test('public approved active professional remains publicly readable', async () => {
  const counters = {
    media: 0,
    verification: 0,
    trust: 0
  };

  const service = createService(
    {
      visibility: 'public',
      moderationStatus: 'approved',
      lifecycleStatus: 'active'
    },
    counters
  );

  const publicProfile = await service.getProfile(profile.id);

  assert.equal(publicProfile.id, profile.id);
  assert.equal(publicProfile.headlineAr, profile.headlineAr);

  await service.getMediaAssets(undefined, profile.id);
  await service.getVerificationStatus(undefined, profile.id);
  await service.getTrustHistory('khedmah_session=session-cookie', profile.id);

  assert.deepEqual(counters, {
    media: 1,
    verification: 1,
    trust: 1
  });
});

test('verification status projection does not expose internal requester fields', async () => {
  const service = createService(
    {
      visibility: 'public',
      moderationStatus: 'approved',
      lifecycleStatus: 'active'
    },
    { media: 0, verification: 0, trust: 0 },
    {
      id: 'verification-1',
      entityType: 'professional',
      entityId: profile.id,
      requesterId: 'private-user',
      status: 'pending',
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z'
    }
  );

  const status = await service.getVerificationStatus(undefined, profile.id);

  assert.deepEqual(status, {
    status: 'pending',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z'
  });

  assert.equal('requesterId' in (status ?? {}), false);
  assert.equal('entityId' in (status ?? {}), false);
});

test('verification request rejects another user profile ownership', async () => {
  const service = createService(
    {
      visibility: 'public',
      moderationStatus: 'approved',
      lifecycleStatus: 'active'
    },
    { media: 0, verification: 0, trust: 0 },
    undefined,
    'another_user'
  );

  await assert.rejects(
    () => service.requestVerification('session-cookie', profile.id),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'Access denied'
  );
});

test('admin approval publishes a professional profile through one repository transaction', async () => {
  let approvalCall: unknown[] | undefined;
  let assertedPermission: string | undefined;
  const repository = {
    findById: async () => profile,
    approveAndPublish: async (...args: unknown[]) => { approvalCall = args; }
  } as unknown as ProfessionalProfileRepository;
  const identity = {
    getCurrentUser: async () => ({ id: 'moderator', email: 'moderator@example.com' })
  } as unknown as IdentityService;
  const rbac = {
    assert: (_email: string, permission: string) => { assertedPermission = permission; return []; }
  } as unknown as OperationsRbacService;
  const service = new ProfessionalProfileService(repository, identity, rbac);

  const approved = await service.approveAndPublish('session-cookie', profile.id);

  assert.equal(assertedPermission, 'security.manage');
  assert.equal(approvalCall?.[0], profile.id);
  assert.equal(approvalCall?.[1], 'moderator');
  assert.equal((approvalCall?.[3] as { newStatus?: string })?.newStatus, 'approved');
  assert.equal(approved.id, profile.id);
});

test('material edits return an approved professional profile to review', async () => {
  let returnToReview: boolean | undefined;
  const repository = {
    findByUserId: async () => profile,
    findContactEligibility: async () => ({
      visibility: 'public',
      moderationStatus: 'approved',
      lifecycleStatus: 'active'
    }),
    save: async (_profile: ProfessionalProfile, review: boolean) => { returnToReview = review; }
  } as unknown as ProfessionalProfileRepository;
  const identity = {
    getCurrentUser: async () => ({ id: profile.userId, email: 'owner@example.com' })
  } as unknown as IdentityService;
  const rbac = {} as OperationsRbacService;
  const service = new ProfessionalProfileService(repository, identity, rbac);

  await service.createOrUpdate('session-cookie', {
    headlineAr: 'مهندس برمجيات أول',
    headlineEn: profile.headlineEn,
    bioAr: profile.bioAr,
    bioEn: profile.bioEn,
    availability: profile.availability,
    cityCode: profile.cityCode,
    countryCode: profile.countryCode,
    skills: profile.skills
  });

  assert.equal(returnToReview, true);
});
