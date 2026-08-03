import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
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
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
  ) {}

  async create(cookieHeader: string | undefined, request: CreateBusinessProfileRequest): Promise<PublicBusinessProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const input = validateCreateBusinessProfile(request);
    const now = new Date().toISOString();
    const profile: BusinessProfile = {
      id: randomUUID(),
      name: input.name,
      descriptionAr: input.descriptionAr,
      descriptionEn: input.descriptionEn,
      ownerUserId: actor.id,
      organizationId: undefined,
      visibility: 'private',
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
    return this.toPublic(profile);
  }

  async listMine(cookieHeader: string | undefined): Promise<PublicBusinessProfile[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profiles = await this.repository.listForUser(actor.id);
    return profiles.map((profile) => this.toPublic(profile));
  }

  async getPublic(id: string): Promise<PublicBusinessProfile> {
    const profile = await this.requireProfile(id);
    if (profile.visibility !== 'public' || profile.trustStatus !== 'approved' || profile.status !== 'active') {
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
    const updated: BusinessProfile = {
      ...profile,
      name: input.name ?? profile.name,
      descriptionAr: input.descriptionAr === undefined ? profile.descriptionAr : input.descriptionAr,
      descriptionEn: input.descriptionEn === undefined ? profile.descriptionEn : input.descriptionEn,
      phone: input.phone === undefined ? profile.phone : input.phone,
      email: input.email === undefined ? profile.email : input.email,
      website: input.website === undefined ? profile.website : input.website,
      visibility: input.visibility ?? profile.visibility,
      categoryCode: input.categoryCode ?? profile.categoryCode,
      cityCode: input.cityCode ?? profile.cityCode,
      countryCode: input.countryCode ?? profile.countryCode,
      lat: input.lat === undefined ? profile.lat : input.lat,
      lng: input.lng === undefined ? profile.lng : input.lng,
      addressAr: input.addressAr === undefined ? profile.addressAr : input.addressAr,
      updatedAt: new Date().toISOString()
    };

    await this.repository.save(updated);
    return this.toPublic(updated);
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

  // --- Media ---
  async addMediaAsset(cookieHeader: string | undefined, entityId: string, asset: Omit<MediaAsset, 'id' | 'createdAt'>): Promise<MediaAsset> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(entityId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    const full: MediaAsset = { ...asset, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.repository.saveMediaAsset(full);
    return full;
  }

  async getMediaAssets(entityType: string, entityId: string, assetType?: string): Promise<MediaAsset[]> {
    return this.repository.listMediaAssets(entityType, entityId, assetType);
  }

  async deleteMediaAsset(cookieHeader: string | undefined, businessId: string, assetId: string): Promise<void> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    await this.repository.deleteMediaAsset(assetId);
  }

  // --- Opening Hours ---
  async setOpeningHours(cookieHeader: string | undefined, businessId: string, hours: Omit<OpeningHours, 'id'>[]): Promise<OpeningHours[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    const saved: OpeningHours[] = [];
    for (const h of hours) {
      const entry: OpeningHours = { ...h, id: randomUUID() };
      await this.repository.saveOpeningHours(entry);
      saved.push(entry);
    }
    return saved;
  }

  async getOpeningHours(businessId: string): Promise<OpeningHours[]> {
    return this.repository.listOpeningHours(businessId);
  }

  // --- Branches ---
  async addBranch(cookieHeader: string | undefined, businessId: string, branch: Omit<BusinessBranch, 'id' | 'businessProfileId'>): Promise<BusinessBranch> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    const full: BusinessBranch = { ...branch, id: randomUUID(), businessProfileId: businessId };
    await this.repository.saveBranch(full);
    return full;
  }

  async getBranches(businessId: string): Promise<BusinessBranch[]> {
    return this.repository.listBranches(businessId);
  }

  // --- Social Links ---
  async setSocialLink(cookieHeader: string | undefined, businessId: string, platform: string, url: string): Promise<BusinessSocialLink> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    const link: BusinessSocialLink = { id: randomUUID(), businessProfileId: businessId, platform, url };
    await this.repository.saveSocialLink(link);
    return link;
  }

  async getSocialLinks(businessId: string): Promise<BusinessSocialLink[]> {
    return this.repository.listSocialLinks(businessId);
  }

  async deleteSocialLink(cookieHeader: string | undefined, businessId: string, linkId: string): Promise<void> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(businessId);
    if (profile.ownerUserId !== actor.id) throw new ForbiddenException(BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE);
    await this.repository.deleteSocialLink(linkId);
  }

  // --- Verification ---
  async requestVerification(cookieHeader: string | undefined, entityType: 'business' | 'professional', entityId: string): Promise<VerificationRequest> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
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

  async getVerificationStatus(entityType: string, entityId: string): Promise<VerificationRequest | undefined> {
    return this.repository.findVerificationRequest(entityType, entityId);
  }

  async getTrustHistory(entityType: string, entityId: string): Promise<TrustHistoryEntry[]> {
    return this.repository.listTrustHistory(entityType, entityId);
  }

  private async requireProfile(id: string): Promise<BusinessProfile> {
    const profile = await this.repository.findById(id);
    if (!profile) {
      throw new NotFoundException(BUSINESS_PROFILE_NOT_FOUND_MESSAGE);
    }
    return profile;
  }

  private toPublic(profile: BusinessProfile): PublicBusinessProfile {
    return {
      id: profile.id,
      name: profile.name,
      descriptionAr: profile.descriptionAr,
      descriptionEn: profile.descriptionEn,
      visibility: profile.visibility,
      trustStatus: profile.trustStatus,
      status: profile.status,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      categoryCode: profile.categoryCode,
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

