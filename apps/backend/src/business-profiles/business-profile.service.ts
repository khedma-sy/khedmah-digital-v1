import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { CategoryService } from '../categories/category.service';
import { BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE, BUSINESS_PROFILE_NOT_FOUND_MESSAGE } from './business-profile.errors';
import { BusinessProfileRepository } from './business-profile.repository';
import { BusinessBranch, BusinessProfile, BusinessSocialLink, MediaAsset, OpeningHours, PublicBusinessProfile, TrustHistoryEntry, VerificationRequest } from './business-profile.types';
import { CreateBusinessProfileRequest, SearchBusinessProfilesRequest, UpdateBusinessProfileRequest, UpdateTrustStatusRequest } from './dto/business-profile.dto';
import { validateBusinessProfileSearch, validateCreateBusinessProfile, validateUpdateBusinessProfile, validateUpdateTrustStatus } from './business-profile.validation';

@Injectable()
export class BusinessProfileService {
  constructor(
    @Inject(BusinessProfileRepository) private readonly repository: BusinessProfileRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService,
    @Inject(CategoryService) private readonly categories: CategoryService
  ) {}

  async create(cookieHeader: string | undefined, request: CreateBusinessProfileRequest): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const input = validateCreateBusinessProfile(request);
    await this.categories.assertActiveCategory(input.categoryCode);
    const now = new Date().toISOString();
    const profile: BusinessProfile = {
      id: randomUUID(),
      name: input.name,
      descriptionAr: input.descriptionAr,
      descriptionEn: input.descriptionEn,
      ownerUserId: actor.id,
      organizationId: undefined,
      visibility: 'private',
      moderationStatus: 'pending',
      trustStatus: 'pending',
      status: 'active',
      phone: input.phone,
      email: input.email,
      website: input.website,
      categoryCode: input.categoryCode,
      cityCode: input.cityCode,
      countryCode: input.countryCode,
      isFeatured: false,
      createdAt: now,
      updatedAt: now
    };

    await this.repository.save(profile);
    return this.toPublic(await this.repository.findById(profile.id) ?? profile);
  }

  async listMine(cookieHeader: string | undefined): Promise<PublicBusinessProfile[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profiles = await this.repository.listForUser(actor.id);
    return profiles.map((profile) => this.toPublic(profile));
  }

  async getPublic(id: string): Promise<PublicBusinessProfile> {
    const profile = await this.requireProfile(id);
    if (profile.visibility !== 'public' || profile.moderationStatus !== 'approved' || profile.trustStatus !== 'approved' || profile.status !== 'active') {
      throw new NotFoundException(BUSINESS_PROFILE_NOT_FOUND_MESSAGE);
    }
    return this.toPublic(profile);
  }

  async update(cookieHeader: string | undefined, id: string, request: UpdateBusinessProfileRequest): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(id);
    if (profile.ownerUserId !== actor.id) {
      throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    }

    const input = validateUpdateBusinessProfile(request);
    if (input.categoryCode && input.categoryCode !== profile.categoryCode) {
      await this.categories.assertActiveCategory(input.categoryCode);
    }
    const materialChange =
      (input.name !== undefined && input.name !== profile.name) ||
      (input.descriptionAr !== undefined && input.descriptionAr !== profile.descriptionAr) ||
      (input.descriptionEn !== undefined && input.descriptionEn !== profile.descriptionEn) ||
      (input.phone !== undefined && input.phone !== profile.phone) ||
      (input.email !== undefined && input.email !== profile.email) ||
      (input.website !== undefined && input.website !== profile.website) ||
      (input.categoryCode !== undefined && input.categoryCode !== profile.categoryCode) ||
      (input.cityCode !== undefined && input.cityCode !== profile.cityCode) ||
      (input.countryCode !== undefined && input.countryCode !== profile.countryCode) ||
      (input.lat !== undefined && input.lat !== profile.lat) ||
      (input.lng !== undefined && input.lng !== profile.lng) ||
      (input.addressAr !== undefined && input.addressAr !== profile.addressAr);
    const requiresReview = materialChange &&
      (profile.visibility === 'public' || profile.moderationStatus === 'approved');
    const updated: BusinessProfile = {
      ...profile,
      name: input.name ?? profile.name,
      descriptionAr: input.descriptionAr === undefined ? profile.descriptionAr : input.descriptionAr,
      descriptionEn: input.descriptionEn === undefined ? profile.descriptionEn : input.descriptionEn,
      phone: input.phone === undefined ? profile.phone : input.phone,
      email: input.email === undefined ? profile.email : input.email,
      website: input.website === undefined ? profile.website : input.website,
      // Publication is an admin decision. Owners may hide a profile, but they
      // cannot bypass review by making a private profile public themselves.
      visibility: requiresReview || input.visibility === 'private' ? 'private' : profile.visibility,
      moderationStatus: requiresReview ? 'pending' : profile.moderationStatus,
      categoryCode: input.categoryCode ?? profile.categoryCode,
      cityCode: input.cityCode ?? profile.cityCode,
      countryCode: input.countryCode ?? profile.countryCode,
      lat: input.lat === undefined ? profile.lat : input.lat,
      lng: input.lng === undefined ? profile.lng : input.lng,
      addressAr: input.addressAr === undefined ? profile.addressAr : input.addressAr,
      updatedAt: new Date().toISOString()
    };

    await this.repository.save(updated);
    return this.toPublic(await this.repository.findById(updated.id) ?? updated);
  }

  async updateTrustStatus(cookieHeader: string | undefined, id: string, request: UpdateTrustStatusRequest): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(id);
    const input = validateUpdateTrustStatus(request);
    const updatedAt = new Date().toISOString();

    await this.repository.updateTrustStatus(profile.id, input.trustStatus, updatedAt);

    // Record trust history
    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'business',
      entityId: profile.id,
      oldStatus: profile.trustStatus,
      newStatus: input.trustStatus,
      changedBy: actor.id,
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);

    return this.toPublic({ ...profile, trustStatus: input.trustStatus, updatedAt });
  }

  async search(request: SearchBusinessProfilesRequest): Promise<{ readonly businesses: PublicBusinessProfile[]; readonly total: number; readonly page: number; }> {
    const input = validateBusinessProfileSearch(request);
    if (input.categoryCode) await this.categories.assertActiveCategoryFilter(input.categoryCode);
    const limit = 20;
    const offset = (input.page - 1) * limit;
    const [profiles, total] = await Promise.all([
      this.repository.listPublicApproved({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode }, limit, offset),
      this.repository.countPublicApproved({ q: input.q, categoryCode: input.categoryCode, cityCode: input.cityCode })
    ]);

    return {
      businesses: profiles.map((profile) => this.toPublic(profile)),
      total,
      page: input.page
    };
  }

  async getFeatured(): Promise<PublicBusinessProfile[]> {
    const profiles = await this.repository.listFeatured(6);
    return profiles.map((p) => this.toPublic(p));
  }

  async getRecentlyAdded(): Promise<PublicBusinessProfile[]> {
    const profiles = await this.repository.listRecentlyAdded(10);
    return profiles.map((p) => this.toPublic(p));
  }

  async listPendingModeration(cookieHeader: string | undefined): Promise<PublicBusinessProfile[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profiles = await this.repository.listPendingModeration();
    return profiles.map((p) => this.toPublic(p));
  }

  // --- Moderation ---
  async submitForReview(cookieHeader: string | undefined, id: string): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(id);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    await this.assertMobilityDocuments(profile);

    const updatedAt = new Date().toISOString();
    await this.repository.updateModerationStatus(profile.id, 'pending', updatedAt);

    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'business',
      entityId: profile.id,
      oldStatus: profile.moderationStatus,
      newStatus: 'pending',
      changedBy: actor.id,
      reason: 'Submitted for review by owner',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);

    return this.toPublic({ ...profile, moderationStatus: 'pending', updatedAt });
  }

  async rejectModeration(cookieHeader: string | undefined, entityId: string, reason: string): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(entityId);
    const updatedAt = new Date().toISOString();

    await this.repository.updateModerationStatus(profile.id, 'rejected', updatedAt);

    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'business',
      entityId: profile.id,
      oldStatus: profile.moderationStatus,
      newStatus: 'rejected',
      changedBy: actor.id,
      reason: reason || 'Rejected by moderator',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);

    return this.toPublic({ ...profile, moderationStatus: 'rejected', updatedAt });
  }

  // --- Media ---
  async addMediaAsset(cookieHeader: string | undefined, entityId: string, asset: Omit<MediaAsset, 'id' | 'createdAt'>): Promise<MediaAsset> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(entityId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    const full: MediaAsset = { ...asset, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.repository.saveMediaAsset(full);
    return full;
  }

  async getMediaAssets(cookieHeader: string | undefined, entityType: string, entityId: string, assetType?: string): Promise<MediaAsset[]> {
    await this.requirePublicOrPrivileged(cookieHeader, entityId);
    return this.repository.listMediaAssets(entityType, entityId, assetType);
  }

  async deleteMediaAsset(cookieHeader: string | undefined, businessId: string, assetId: string): Promise<void> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    await this.repository.deleteMediaAsset(businessId, assetId);
  }

  // --- Opening Hours ---
  async setOpeningHours(cookieHeader: string | undefined, businessId: string, hours: Omit<OpeningHours, 'id'>[]): Promise<OpeningHours[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    if (hours.length !== 7 || new Set(hours.map((hour) => hour.dayOfWeek)).size !== 7) {
      throw new BadRequestException('Opening hours must contain each day of the week exactly once.');
    }
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const hour of hours) {
      if (hour.dayOfWeek < 0 || hour.dayOfWeek > 6 || !validTime.test(hour.openTime) || !validTime.test(hour.closeTime)) {
        throw new BadRequestException('Opening hours contain an invalid day or time.');
      }
      if (!hour.isClosed && hour.openTime >= hour.closeTime) {
        throw new BadRequestException('Opening time must be earlier than closing time.');
      }
    }
    const saved = hours.map((hour) => ({ ...hour, id: randomUUID() }));
    await this.repository.replaceOpeningHours(businessId, saved);
    return saved;
  }

  async getOpeningHours(cookieHeader: string | undefined, businessId: string): Promise<OpeningHours[]> {
    await this.requirePublicOrPrivileged(cookieHeader, businessId);
    return this.repository.listOpeningHours(businessId);
  }

  // --- Branches ---
  async addBranch(cookieHeader: string | undefined, businessId: string, branch: Omit<BusinessBranch, 'id' | 'businessProfileId'>): Promise<BusinessBranch> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    if (!branch.nameAr?.trim() || !branch.cityCode?.trim()) throw new BadRequestException('Branch name and city are required.');
    const full: BusinessBranch = { ...branch, nameAr: branch.nameAr.trim(), cityCode: branch.cityCode.trim(), id: randomUUID(), businessProfileId: businessId };
    await this.repository.saveBranch(full);
    return full;
  }

  async getBranches(cookieHeader: string | undefined, businessId: string): Promise<BusinessBranch[]> {
    await this.requirePublicOrPrivileged(cookieHeader, businessId);
    return this.repository.listBranches(businessId);
  }

  async deleteBranch(cookieHeader: string | undefined, businessId: string, branchId: string): Promise<void> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    await this.repository.deleteBranch(businessId, branchId);
  }

  // --- Social Links ---
  async setSocialLink(cookieHeader: string | undefined, businessId: string, platform: string, url: string): Promise<BusinessSocialLink> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    const allowedPlatforms = new Set(['facebook', 'instagram', 'linkedin', 'youtube', 'whatsapp']);
    if (!allowedPlatforms.has(platform)) throw new BadRequestException('Unsupported social platform.');
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new BadRequestException('Social link must be a valid URL.'); }
    if (parsed.protocol !== 'https:') throw new BadRequestException('Social link must use HTTPS.');
    const link: BusinessSocialLink = { id: randomUUID(), businessProfileId: businessId, platform, url: parsed.toString() };
    await this.repository.saveSocialLink(link);
    return link;
  }

  async getSocialLinks(cookieHeader: string | undefined, businessId: string): Promise<BusinessSocialLink[]> {
    await this.requirePublicOrPrivileged(cookieHeader, businessId);
    return this.repository.listSocialLinks(businessId);
  }

  async deleteSocialLink(cookieHeader: string | undefined, businessId: string, linkId: string): Promise<void> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    await this.repository.deleteSocialLink(businessId, linkId);
  }

  // --- Verification ---
  async requestVerification(cookieHeader: string | undefined, entityType: 'business' | 'professional', entityId: string): Promise<VerificationRequest> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    if (entityType !== 'business') throw new BadRequestException('Unsupported verification entity type.');
    const profile = await this.requireProfile(entityId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    await this.assertMobilityDocuments(profile);
    const existing = await this.repository.findVerificationRequest(entityType, entityId);
    if (existing?.status === 'pending' || existing?.status === 'approved') return existing;
    const req: VerificationRequest = {
      id: randomUUID(),
      entityType,
      entityId,
      requesterId: actor.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.repository.saveVerificationRequest(req);
    return req;
  }

  async getVerificationStatus(
    cookieHeader: string | undefined,
    entityType: string,
    entityId: string
  ): Promise<Pick<VerificationRequest, 'status' | 'createdAt' | 'updatedAt'> | undefined> {
    await this.requirePublicOrPrivileged(cookieHeader, entityId);
    const request = await this.repository.findVerificationRequest(entityType, entityId);
    return request ? { status: request.status, createdAt: request.createdAt, updatedAt: request.updatedAt } : undefined;
  }

  async getTrustHistory(cookieHeader: string | undefined, entityType: string, entityId: string): Promise<TrustHistoryEntry[]> {
    await this.requireOwnerOrAdmin(cookieHeader, entityId);
    return this.repository.listTrustHistory(entityType, entityId);
  }

  async approveVerification(cookieHeader: string | undefined, entityId: string): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(entityId);
    await this.assertApprovedMobilityDocuments(profile);
    const updatedAt = new Date().toISOString();
    await this.repository.updateTrustStatus(profile.id, 'approved', updatedAt);
    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'business',
      entityId: profile.id,
      oldStatus: profile.trustStatus,
      newStatus: 'approved',
      changedBy: actor.id,
      reason: 'Verification approved',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);
    return this.toPublic({ ...profile, trustStatus: 'approved', updatedAt });
  }

  async approveModeration(cookieHeader: string | undefined, entityId: string): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(entityId);
    await this.assertApprovedMobilityDocuments(profile);
    const updatedAt = new Date().toISOString();

    await this.repository.updateModerationStatus(profile.id, 'approved', updatedAt);

    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'business',
      entityId: profile.id,
      oldStatus: profile.moderationStatus,
      newStatus: 'approved',
      changedBy: actor.id,
      reason: 'Approved by moderator',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);

    return this.toPublic({ ...profile, moderationStatus: 'approved', updatedAt });
  }

  async approveAndPublish(cookieHeader: string | undefined, entityId: string): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(entityId);
    await this.assertApprovedMobilityDocuments(profile);
    const updatedAt = new Date().toISOString();
    const historyEntries: TrustHistoryEntry[] = [
      {
        id: randomUUID(),
        entityType: 'business',
        entityId: profile.id,
        oldStatus: profile.moderationStatus,
        newStatus: 'approved',
        changedBy: actor.id,
        reason: 'Moderation approved during final publication',
        createdAt: updatedAt
      },
      {
        id: randomUUID(),
        entityType: 'business',
        entityId: profile.id,
        oldStatus: profile.trustStatus,
        newStatus: 'approved',
        changedBy: actor.id,
        reason: 'Trust approved and profile published',
        createdAt: updatedAt
      }
    ];
    try {
      await this.repository.approveAndPublish(profile.id, actor.id, updatedAt, historyEntries);
    } catch (error) {
      if (error instanceof Error && error.message === 'MOBILITY_DOCUMENTS_REQUIRED') {
        throw new BadRequestException('Driver photo, identity card, driving licence and vehicle licence are required before publication.');
      }
      throw error;
    }
    return this.toPublic({
      ...profile,
      visibility: 'public',
      moderationStatus: 'approved',
      trustStatus: 'approved',
      updatedAt
    });
  }

  async suspendBusiness(cookieHeader: string | undefined, entityId: string, reason: string): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(entityId);
    const updatedAt = new Date().toISOString();
    await this.repository.updateTrustStatus(profile.id, 'suspended', updatedAt);
    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'business',
      entityId: profile.id,
      oldStatus: profile.trustStatus,
      newStatus: 'suspended',
      changedBy: actor.id,
      reason: reason || 'Suspended by operator',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);
    return this.toPublic({ ...profile, trustStatus: 'suspended', updatedAt });
  }

  async reactivateBusiness(cookieHeader: string | undefined, entityId: string): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(entityId);
    const updatedAt = new Date().toISOString();
    await this.repository.updateTrustStatus(profile.id, 'approved', updatedAt);
    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'business',
      entityId: profile.id,
      oldStatus: profile.trustStatus,
      newStatus: 'approved',
      changedBy: actor.id,
      reason: 'Reactivated after suspension',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);
    return this.toPublic({ ...profile, trustStatus: 'approved', updatedAt });
  }

  private async requireProfile(id: string): Promise<BusinessProfile> {
    const profile = await this.repository.findById(id);
    if (!profile) {
      throw new NotFoundException(BUSINESS_PROFILE_NOT_FOUND_MESSAGE);
    }
    return profile;
  }

  private async requirePublicOrPrivileged(cookieHeader: string | undefined, id: string): Promise<BusinessProfile> {
    const profile = await this.requireProfile(id);
    const actor = await this.identity.getSession(readSessionToken(cookieHeader));
    if (actor && (profile.ownerUserId === actor.id || this.rbac.permissionsFor(actor.email).includes('security.manage'))) {
      return profile;
    }
    if (
      profile.visibility !== 'public' ||
      profile.moderationStatus !== 'approved' ||
      profile.trustStatus !== 'approved' ||
      profile.status !== 'active'
    ) {
      throw new NotFoundException(BUSINESS_PROFILE_NOT_FOUND_MESSAGE);
    }
    return profile;
  }

  private async requireOwnerOrAdmin(cookieHeader: string | undefined, id: string): Promise<BusinessProfile> {
    const profile = await this.requireProfile(id);
    const actor = await this.identity.getSession(readSessionToken(cookieHeader));
    if (!actor || (profile.ownerUserId !== actor.id && !this.rbac.permissionsFor(actor.email).includes('security.manage'))) {
      throw new NotFoundException(BUSINESS_PROFILE_NOT_FOUND_MESSAGE);
    }
    return profile;
  }

  private async assertMobilityDocuments(profile:BusinessProfile):Promise<void>{
    if(profile.categoryCode!=='taxi'&&profile.categoryCode!=='delivery_courier')return;
    if(await this.repository.countMobilityDocuments(profile.id)!==4)throw new BadRequestException('Driver photo, identity card, driving licence and vehicle licence are required before review.');
  }

  private async assertApprovedMobilityDocuments(profile:BusinessProfile):Promise<void>{
    if(profile.categoryCode!=='taxi'&&profile.categoryCode!=='delivery_courier')return;
    if(await this.repository.countApprovedMobilityDocuments(profile.id)!==4)throw new BadRequestException('Every required driver document must be approved before publication.');
  }

  private toPublic(profile: BusinessProfile): PublicBusinessProfile {
    return {
      id: profile.id,
      name: profile.name,
      descriptionAr: profile.descriptionAr,
      descriptionEn: profile.descriptionEn,
      visibility: profile.visibility,
      moderationStatus: profile.moderationStatus,
      trustStatus: profile.trustStatus,
      status: profile.status,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      categoryCode: profile.categoryCode,
      categoryNameAr: profile.categoryNameAr,
      cityCode: profile.cityCode,
      countryCode: profile.countryCode,
      lat: profile.lat,
      lng: profile.lng,
      addressAr: profile.addressAr,
      isFeatured: profile.isFeatured,
      createdAt: profile.createdAt
    };
  }
}
