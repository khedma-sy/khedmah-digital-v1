import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { CreateProfessionalProfileRequest, SearchProfessionalProfilesRequest } from './dto/professional-profile.dto';
import { ProfessionalProfileService } from './professional-profile.service';

@Controller('professionals')
export class ProfessionalProfilesController {
  constructor(@Inject(ProfessionalProfileService) private readonly professionals: ProfessionalProfileService) {}

  @Post()
  async createOrUpdate(@Headers('cookie') cookieHeader: string | undefined, @Body() body: CreateProfessionalProfileRequest) {
    return { professional: await this.professionals.createOrUpdate(cookieHeader, body) };
  }

  @Get('featured')
  async getFeatured() {
    return { professionals: await this.professionals.getFeatured() };
  }

  @Get('me')
  async getMine(@Headers('cookie') cookieHeader: string | undefined) {
    return { professional: await this.professionals.getMine(cookieHeader) };
  }

  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('cityCode') cityCode?: string,
    @Query('availability') availability?: string,
    @Query('page') page?: string
  ) {
    const query: SearchProfessionalProfilesRequest = { q, cityCode, availability, page };
    return await this.professionals.search(query);
  }

  @Get(':id')
  async getProfile(@Param('id') id: string) {
    return { professional: await this.professionals.getProfile(id) };
  }

  // --- Media ---
  @Post(':id/media')
  async addMedia(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: { assetType: string; url: string; storagePath: string; mimeType: string; sizeBytes?: number; sortOrder?: number }
  ) {
    const asset = await this.professionals.addMediaAsset(cookieHeader, id, {
      entityType: 'professional',
      entityId: id,
      assetType: body.assetType as 'profile_image' | 'gallery',
      url: body.url,
      storagePath: body.storagePath,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes ?? 0,
      sortOrder: body.sortOrder ?? 0
    });
    return { asset };
  }

  @Get(':id/media')
  async getMedia(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Query('assetType') assetType?: string) {
    return { assets: await this.professionals.getMediaAssets(cookieHeader, id, assetType) };
  }

  // --- Verification ---
  @Post(':id/verification-request')
  async requestVerification(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { request: await this.professionals.requestVerification(cookieHeader, id) };
  }

  @Get(':id/verification-status')
  async getVerificationStatus(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { status: await this.professionals.getVerificationStatus(cookieHeader, id) ?? null };
  }

  @Get(':id/trust-history')
  async getTrustHistory(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { history: await this.professionals.getTrustHistory(cookieHeader, id) };
  }

  @Post(':id/submit')
  async submit(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { professional: await this.professionals.submitForReview(cookieHeader, id) };
  }

  @Post(':id/moderation/approve')
  async approveModeration(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { professional: await this.professionals.approveModeration(cookieHeader, id) };
  }

  @Post(':id/moderation/approve-and-publish')
  async approveAndPublish(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { professional: await this.professionals.approveAndPublish(cookieHeader, id) };
  }

  @Post(':id/moderation/reject')
  async rejectModeration(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: { reason: string }) {
    return { professional: await this.professionals.rejectModeration(cookieHeader, id, body.reason) };
  }

  @Post(':id/moderation/suspend')
  async suspend(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: { reason: string }) {
    return { professional: await this.professionals.suspendProfessional(cookieHeader, id, body.reason) };
  }
}
