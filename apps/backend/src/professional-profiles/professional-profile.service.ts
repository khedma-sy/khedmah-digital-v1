import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { PROFESSIONAL_PROFILE_NOT_FOUND_MESSAGE } from './professional-profile.errors';
import { ProfessionalProfileRepository } from './professional-profile.repository';
import { MediaAsset, ProfessionalProfile, PublicProfessionalProfile, TrustHistoryEntry, VerificationRequest } from './professional-profile.types';
import { CreateProfessionalProfileRequest, SearchProfessionalProfilesRequest } from './dto/professional-profile.dto';
import { validateProfessionalProfileSearch, validateProfessionalProfileUpsert } from './professional-profile.validation';

@Injectable()
export class ProfessionalProfileService {
  constructor(
    @Inject(ProfessionalProfileRepository) private readonly repository: ProfessionalProfileRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
  ) {}

  async createOrUpdate(cookieHeader: string | undefined, request: CreateProfessionalProfileRequest): Promise<PublicProfessionalProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const input = validateProfessionalProfileUpsert(request);
    const existing = await this.repository.findByUserId(actor.id);
    const existingEligibility = existing ? await this.repository.findContactEligibility(existing.id) : undefined;
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
          id: `professional_profile_${randomUUID().replaceAll('-', '')}`,
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

    const materialChange = Boolean(existing) && (
      existing!.headlineAr !== profile.headlineAr ||
      existing!.headlineEn !== profile.headlineEn ||
      existing!.bioAr !== profile.bioAr ||
      existing!.bioEn !== profile.bioEn ||
      existing!.availability !== profile.availability ||
      existing!.cityCode !== profile.cityCode ||
      existing!.countryCode !== profile.countryCode ||
      JSON.stringify(existing!.skills) !== JSON.stringify(profile.skills)
    );
    const requiresReview = materialChange && Boolean(existingEligibility) && (
      existingEligibility!.visibility === 'public' ||
      existingEligibility!.moderationStatus === 'approved'
    );
    await this.repository.save(profile, requiresReview);
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
    const profile = await this.requirePublicProfile(id);
    return this.toPublic(profile);
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

  async getMediaAssets(cookieHeader: string | undefined, profileId: string, assetType?: string): Promise<MediaAsset[]> {
    await this.requirePublicOrPrivileged(cookieHeader, profileId);
    return this.repository.listMediaAssets(profileId, assetType);
  }

  async requestVerification(cookieHeader: string | undefined, profileId: string): Promise<VerificationRequest> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(profileId);

    if (profile.userId !== actor.id) {
      throw new ForbiddenException('Access denied');
    }

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

  async getVerificationStatus(cookieHeader: string | undefined, profileId: string): Promise<{ status: VerificationRequest['status']; createdAt: string; updatedAt: string } | undefined> {
    await this.requirePublicOrPrivileged(cookieHeader, profileId);

    const request = await this.repository.findVerificationRequest(profileId);

    if (!request) {
      return undefined;
    }

    return {
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    };
  }

  async getTrustHistory(cookieHeader: string | undefined, profileId: string): Promise<TrustHistoryEntry[]> {
    await this.requireOwnerOrAdmin(cookieHeader, profileId);
    return this.repository.listTrustHistory(profileId);
  }

  async listPendingModeration(cookieHeader: string | undefined): Promise<PublicProfessionalProfile[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profiles = await this.repository.listPendingModeration();
    const result: PublicProfessionalProfile[] = [];
    for (const p of profiles) {
      result.push(await this.toPublic(p));
    }
    return result;
  }

  async submitForReview(cookieHeader: string | undefined, id: string): Promise<PublicProfessionalProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const profile = await this.requireProfile(id);
    if (profile.userId !== actor.id) throw new ForbiddenException('Access denied');

    const updatedAt = new Date().toISOString();
    await this.repository.updateModerationStatus(profile.id, 'pending', updatedAt);
    await this.repository.updateLifecycleStatus(profile.id, 'pending', updatedAt);

    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'professional',
      entityId: profile.id,
      newStatus: 'pending',
      changedBy: actor.id,
      reason: 'Submitted for review by owner',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);

    return this.toPublic({ ...profile, updatedAt });
  }

  async approveModeration(cookieHeader: string | undefined, id: string): Promise<PublicProfessionalProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(id);

    const updatedAt = new Date().toISOString();
    await this.repository.updateModerationStatus(profile.id, 'approved', updatedAt);
    await this.repository.updateLifecycleStatus(profile.id, 'active', updatedAt);

    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'professional',
      entityId: profile.id,
      newStatus: 'approved',
      changedBy: actor.id,
      reason: 'Approved by moderator',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);

    return this.toPublic({ ...profile, updatedAt });
  }

  async approveAndPublish(cookieHeader: string | undefined, id: string): Promise<PublicProfessionalProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(id);
    const updatedAt = new Date().toISOString();
    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'professional',
      entityId: profile.id,
      newStatus: 'approved',
      changedBy: actor.id,
      reason: 'Moderation approved and professional profile published',
      createdAt: updatedAt
    };
    await this.repository.approveAndPublish(profile.id, actor.id, updatedAt, historyEntry);
    return this.toPublic({ ...profile, updatedAt });
  }

  async rejectModeration(cookieHeader: string | undefined, id: string, reason: string): Promise<PublicProfessionalProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(id);

    const updatedAt = new Date().toISOString();
    await this.repository.updateModerationStatus(profile.id, 'rejected', updatedAt);
    await this.repository.updateLifecycleStatus(profile.id, 'suspended', updatedAt);

    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'professional',
      entityId: profile.id,
      newStatus: 'rejected',
      changedBy: actor.id,
      reason: reason || 'Rejected by moderator',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);

    return this.toPublic({ ...profile, updatedAt });
  }

  async suspendProfessional(cookieHeader: string | undefined, id: string, reason: string): Promise<PublicProfessionalProfile> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const profile = await this.requireProfile(id);

    const updatedAt = new Date().toISOString();
    await this.repository.updateModerationStatus(profile.id, 'suspended', updatedAt);
    await this.repository.updateLifecycleStatus(profile.id, 'suspended', updatedAt);

    const historyEntry: TrustHistoryEntry = {
      id: randomUUID(),
      entityType: 'professional',
      entityId: profile.id,
      newStatus: 'suspended',
      changedBy: actor.id,
      reason: reason || 'Suspended by moderator',
      createdAt: updatedAt
    };
    await this.repository.saveTrustHistory(historyEntry);

    return this.toPublic({ ...profile, updatedAt });
  }

  private async requireProfile(id: string): Promise<ProfessionalProfile> {
    const profile = await this.repository.findById(id);
    if (!profile) throw new NotFoundException(PROFESSIONAL_PROFILE_NOT_FOUND_MESSAGE);
    return profile;
  }

  private async requirePublicProfile(id: string): Promise<ProfessionalProfile> {
    const profile = await this.requireProfile(id);
    const eligibility = await this.repository.findContactEligibility(id);

    if (
      !eligibility ||
      eligibility.visibility !== 'public' ||
      eligibility.moderationStatus !== 'approved' ||
      eligibility.lifecycleStatus !== 'active'
    ) {
      throw new NotFoundException(PROFESSIONAL_PROFILE_NOT_FOUND_MESSAGE);
    }

    return profile;
  }

  private async requirePublicOrPrivileged(cookieHeader: string | undefined, id: string): Promise<ProfessionalProfile> {
    const profile = await this.requireProfile(id);
    const actor = await this.identity.getSession(readSessionToken(cookieHeader));
    if (actor && (profile.userId === actor.id || this.rbac.permissionsFor(actor.email).includes('security.manage'))) {
      return profile;
    }
    return this.requirePublicProfile(id);
  }

  private async requireOwnerOrAdmin(cookieHeader: string | undefined, id: string): Promise<ProfessionalProfile> {
    const profile = await this.requireProfile(id);
    const actor = await this.identity.getSession(readSessionToken(cookieHeader));
    if (!actor || (profile.userId !== actor.id && !this.rbac.permissionsFor(actor.email).includes('security.manage'))) {
      throw new NotFoundException(PROFESSIONAL_PROFILE_NOT_FOUND_MESSAGE);
    }
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
