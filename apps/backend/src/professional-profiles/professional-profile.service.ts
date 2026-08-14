import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { PROFESSIONAL_PROFILE_NOT_FOUND_MESSAGE } from './professional-profile.errors';
import { ProfessionalProfileRepository } from './professional-profile.repository';
import { MediaAsset, ProfessionalProfile, PublicProfessionalProfile, TrustHistoryEntry, VerificationRequest } from './professional-profile.types';
import { CreateProfessionalProfileRequest, SearchProfessionalProfilesRequest } from './dto/professional-profile.dto';
import { validateProfessionalProfileSearch, validateProfessionalProfileUpsert } from './professional-profile.validation';

@Injectable()
export class ProfessionalProfileService {
  constructor(
    @Inject(ProfessionalProfileRepository) private readonly repository: ProfessionalProfileRepository,
    @Inject(IdentityService) private readonly identity: IdentityService
  ) {}

  async createOrUpdate(cookieHeader: string | undefined, request: CreateProfessionalProfileRequest): Promise<PublicProfessionalProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const input = validateProfessionalProfileUpsert(request);
    const existing = await this.repository.findByUserId(actor.id);
    const now = new Date().toISOString();
    const profile: ProfessionalProfile = existing
      ? {
          ...existing,
          headlineAr: input.headlineAr,
          headlineEn: input.headlineEn,
          bioAr: input.bioAr,
          bioEn: input.bioEn,
          availability: input.availability,
          cityCode: input.cityCode,
          countryCode: input.countryCode,
          skills: input.skills,
          updatedAt: now
        }
      : {
          id: randomUUID(),
          userId: actor.id,
          headlineAr: input.headlineAr,
          headlineEn: input.headlineEn,
          bioAr: input.bioAr,
          bioEn: input.bioEn,
          availability: input.availability,
          cityCode: input.cityCode,
          countryCode: input.countryCode,
          skills: input.skills,
          isFeatured: false,
          createdAt: now,
          updatedAt: now
        };

    await this.repository.save(profile);
    return this.toPublic(profile);
  }

  async getMine(cookieHeader: string | undefined): Promise<PublicProfessionalProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.repository.findByUserId(actor.id);
    if (!profile) {
      throw new NotFoundException(PROFESSIONAL_PROFILE_NOT_FOUND_MESSAGE);
    }
    return this.toPublic(profile);
  }

  async getProfile(id: string): Promise<PublicProfessionalProfile> {
    const profile = await this.repository.findById(id);
    if (!profile) {
      throw new NotFoundException(PROFESSIONAL_PROFILE_NOT_FOUND_MESSAGE);
    }
    const publicProfile = this.toPublic(profile);
    const eligibility = await this.repository.findContactEligibility(id);
    return eligibility ? {
      ...publicProfile,
      contactEligibility: {
        ...eligibility,
        eligible: eligibility.visibility === 'public' && eligibility.moderationStatus === 'approved' && eligibility.lifecycleStatus === 'active'
      }
    } : publicProfile;
  }

  async search(request: SearchProfessionalProfilesRequest): Promise<{ readonly professionals: PublicProfessionalProfile[]; readonly page: number; }> {
    const input = validateProfessionalProfileSearch(request);
    const limit = 20;
    const offset = (input.page - 1) * limit;
    const profiles = await this.repository.listPublic({ q: input.q, cityCode: input.cityCode, availability: input.availability }, limit, offset);
    return {
      professionals: profiles.map((profile) => this.toPublic(profile)),
      page: input.page
    };
  }

  async getFeatured(): Promise<PublicProfessionalProfile[]> {
    const profiles = await this.repository.listFeatured(6);
    return profiles.map((p) => this.toPublic(p));
  }

  async addMediaAsset(cookieHeader: string | undefined, profileId: string, asset: Omit<MediaAsset, 'id' | 'createdAt'>): Promise<MediaAsset> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(profileId);
    if (profile.userId !== actor.id) throw new ForbiddenException('Access denied');
    const full: MediaAsset = { ...asset, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.repository.saveMediaAsset(full);
    return full;
  }

  async getMediaAssets(profileId: string, assetType?: string): Promise<MediaAsset[]> {
    return this.repository.listMediaAssets(profileId, assetType);
  }

  async requestVerification(cookieHeader: string | undefined, profileId: string): Promise<VerificationRequest> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const req: VerificationRequest = {
      id: randomUUID(),
      entityType: 'professional',
      entityId: profileId,
      requesterId: actor.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.repository.saveVerificationRequest(req);
    return req;
  }

  async getVerificationStatus(profileId: string): Promise<VerificationRequest | undefined> {
    return this.repository.findVerificationRequest(profileId);
  }

  async getTrustHistory(profileId: string): Promise<TrustHistoryEntry[]> {
    return this.repository.listTrustHistory(profileId);
  }

  private async requireProfile(id: string): Promise<ProfessionalProfile> {
    const profile = await this.repository.findById(id);
    if (!profile) throw new NotFoundException(PROFESSIONAL_PROFILE_NOT_FOUND_MESSAGE);
    return profile;
  }

  private toPublic(profile: ProfessionalProfile): PublicProfessionalProfile {
    return {
      id: profile.id,
      headlineAr: profile.headlineAr,
      headlineEn: profile.headlineEn,
      bioAr: profile.bioAr,
      bioEn: profile.bioEn,
      availability: profile.availability,
      cityCode: profile.cityCode,
      countryCode: profile.countryCode,
      skills: [...profile.skills],
      isFeatured: profile.isFeatured,
      createdAt: profile.createdAt
    };
  }
}
