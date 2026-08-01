import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { BUSINESS_PROFILE_ACCESS_DENIED_MESSAGE, BUSINESS_PROFILE_NOT_FOUND_MESSAGE } from './business-profile.errors';
import { BusinessProfileRepository } from './business-profile.repository';
import { PublicBusinessProfile, BusinessProfile } from './business-profile.types';
import { CreateBusinessProfileRequest, SearchBusinessProfilesRequest, UpdateBusinessProfileRequest, UpdateTrustStatusRequest } from './dto/business-profile.dto';
import { validateBusinessProfileSearch, validateCreateBusinessProfile, validateUpdateBusinessProfile, validateUpdateTrustStatus } from './business-profile.validation';

@Injectable()
export class BusinessProfileService {
  constructor(
    @Inject(BusinessProfileRepository) private readonly repository: BusinessProfileRepository,
    @Inject(IdentityService) private readonly identity: IdentityService
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
      updatedAt: new Date().toISOString()
    };

    await this.repository.save(updated);
    return this.toPublic(updated);
  }

  async updateTrustStatus(cookieHeader: string | undefined, id: string, request: UpdateTrustStatusRequest): Promise<PublicBusinessProfile> {
    await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(id);
    const input = validateUpdateTrustStatus(request);
    const updatedAt = new Date().toISOString();
    await this.repository.updateTrustStatus(profile.id, input.trustStatus, updatedAt);
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
      ownerUserId: profile.ownerUserId,
      visibility: profile.visibility,
      trustStatus: profile.trustStatus,
      status: profile.status,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      categoryCode: profile.categoryCode,
      cityCode: profile.cityCode,
      countryCode: profile.countryCode
    };
  }
}
