import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { BusinessProfileService } from '../business-profiles/business-profile.service';
import { ProfessionalProfileRepository } from '../professional-profiles/professional-profile.repository';
import { ProfessionalProfileService } from '../professional-profiles/professional-profile.service';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { SessionTokenService } from '../identity/security/session-token.service';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { CategoryRepository } from '../categories/category.repository';
import { CategoryService } from '../categories/category.service';

const rawPool = createTestPool();

async function createFixture() {
  await resetCanonicalTestSchema(rawPool);
  const pool = DatabasePool.fromPool(rawPool);
  const identityRepo = new IdentityRepository(pool);
  const sessionTokens = new SessionTokenService();
  const identityService = new IdentityService(identityRepo, sessionTokens);
  const rbac = new OperationsRbacService();
  await pool.query(`INSERT INTO categories (code, name_ar) VALUES ('restaurant', 'مطاعم') ON CONFLICT (code) DO NOTHING`);
  const categories = new CategoryService(new CategoryRepository(pool));
  const businessRepo = new BusinessProfileRepository(pool);
  const businessService = new BusinessProfileService(businessRepo, identityService, rbac, categories);
  const professionalRepo = new ProfessionalProfileRepository(pool);
  const professionalService = new ProfessionalProfileService(professionalRepo, identityService, rbac);

  return { pool, identityRepo, identityService, businessService, professionalService, sessionTokens };
}

async function createUser(identityRepo: any, sessionTokens: SessionTokenService, email: string) {
  const userId = `${email.split('@')[0]}_test_user`;
  const now = new Date().toISOString();
  await identityRepo.saveAccount({
    id: userId,
    email,
    passwordHash: 'hash',
    status: 'active',
    createdAt: now,
    updatedAt: now
  });
  await identityRepo.saveProfile({
    userId,
    displayName: userId,
    locale: 'ar',
    createdAt: now,
    updatedAt: now
  });
  const token = sessionTokens.createToken();
  await identityRepo.saveSession({
    id: `session_${userId}`,
    userId,
    tokenHash: sessionTokens.hashToken(token),
    expiresAt: sessionTokens.expiresAt(),
    createdAt: now
  });
  return { userId, cookie: `khedmah_session=${token}` };
}

test('Moderation Vertical Slice: Business Workflow', async () => {
  const { identityRepo, businessService, sessionTokens } = await createFixture();
  const ownerEmail = 'owner@example.com';
  const owner = await createUser(identityRepo, sessionTokens, ownerEmail);
  const ownerCookie = owner.cookie;

  // 1. Create business (starts as pending/private)
  const business = await businessService.create(ownerCookie, {
    name: 'Test Business',
    categoryCode: 'restaurant',
    cityCode: 'damascus',
    countryCode: 'sy'
  });
  assert.equal(business.moderationStatus, 'pending');

  // 2. Submit for review (sets to pending, but explicitly)
  await businessService.submitForReview(ownerCookie, business.id);
  const submitted = await businessService.getPublic(business.id).catch(() => null);
  assert.equal(submitted, null); // Still not public

  // 3. Admin Approve
  const adminEmail = 'admin@example.com';
  const admin = await createUser(identityRepo, sessionTokens, adminEmail);
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ [adminEmail]: ['operations_product_director'] });
  const adminCookie = admin.cookie;

  await businessService.approveAndPublish(adminCookie, business.id);

  const publicBusiness = await businessService.getPublic(business.id);
  assert.equal(publicBusiness.moderationStatus, 'approved');

  // 4. Admin Reject
  await businessService.rejectModeration(adminCookie, business.id, 'Inappropriate content');
  const rejected = await businessService.getPublic(business.id).catch(() => null);
  assert.equal(rejected, null); // Hidden again
});

test('Moderation Vertical Slice: Professional Workflow', async () => {
  const { pool, identityRepo, professionalService, sessionTokens } = await createFixture();
  const ownerEmail = 'pro@example.com';
  const owner = await createUser(identityRepo, sessionTokens, ownerEmail);
  const ownerCookie = owner.cookie;

  // 1. Create professional
  const pro = await professionalService.createOrUpdate(ownerCookie, {
    headlineAr: 'محترف تيست',
    cityCode: 'damascus',
    countryCode: 'sy',
    skills: ['test']
  });

  // 2. Submit for review
  await professionalService.submitForReview(ownerCookie, pro.id);

  // 3. Admin Approve
  const adminEmail = 'admin@example.com';
  const admin = await createUser(identityRepo, sessionTokens, adminEmail);
  process.env.OPERATIONS_PRODUCT_ROLE_BINDINGS = JSON.stringify({ [adminEmail]: ['operations_product_director'] });
  const adminCookie = admin.cookie;

  await professionalService.approveModeration(adminCookie, pro.id);
  await pool.query(`UPDATE professional_profiles SET visibility = 'public' WHERE professional_profile_identifier = $1`, [pro.id]);
  const approved = await professionalService.getProfile(pro.id);
  assert.equal(approved.id, pro.id);
  assert.equal(approved.headlineAr, 'محترف تيست');

  // 4. Admin Reject
  await professionalService.rejectModeration(adminCookie, pro.id, 'Invalid credentials');
  const rejected = await professionalService.getProfile(pro.id).catch(() => null);
  assert.equal(rejected, null); // Rejected profiles fail closed on public reads
});
