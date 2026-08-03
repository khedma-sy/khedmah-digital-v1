import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { PROFESSIONAL_PROFILE_NOT_FOUND_MESSAGE } from './professional-profile.errors';
import { ProfessionalProfileRepository } from './professional-profile.repository';
import { ProfessionalProfile, PublicProfessionalProfile } from './professional-profile.types';
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
      skills: profile.skills
    };
  }
}
