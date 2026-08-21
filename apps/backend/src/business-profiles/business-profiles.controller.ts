import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { BusinessProfileService } from './business-profile.service';
import { CreateBusinessProfileRequest, SearchBusinessProfilesRequest, UpdateBusinessProfileRequest, UpdateTrustStatusRequest } from './dto/business-profile.dto';

@Controller('businesses')
export class BusinessProfilesController {
  constructor(@Inject(BusinessProfileService) private readonly businessProfiles: BusinessProfileService) {}

  @Post()
  async create(@Headers('cookie') cookieHeader: string | undefined, @Body() body: CreateBusinessProfileRequest) {
    return { business: await this.businessProfiles.create(cookieHeader, body) };
  }

  @Get('my')
  async listMine(@Headers('cookie') cookieHeader: string | undefined) {
    return { businesses: await this.businessProfiles.listMine(cookieHeader) };
  }

  @Get('featured')
  async getFeatured() {
    return { businesses: await this.businessProfiles.getFeatured() };
  }

  @Get('recently-added')
  async getRecentlyAdded() {
    return { businesses: await this.businessProfiles.getRecentlyAdded() };
  }

  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('categoryCode') categoryCode?: string,
    @Query('cityCode') cityCode?: string,
    @Query('page') page?: string
  ) {
    const query: SearchBusinessProfilesRequest = { q, categoryCode, cityCode, page };
    return await this.businessProfiles.search(query);
  }

  @Get(':id')
  async getPublic(@Param('id') id: string) {
    return { business: await this.businessProfiles.getPublic(id) };
  }

  @Patch(':id')
  async update(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: UpdateBusinessProfileRequest) {
    return { business: await this.businessProfiles.update(cookieHeader, id, body) };
  }

  @Patch(':id/trust-status')
  async updateTrustStatus(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: UpdateTrustStatusRequest) {
    return { business: await this.businessProfiles.updateTrustStatus(cookieHeader, id, body) };
  }

  // --- Media ---
  @Post(':id/media')
  async addMedia(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: { assetType: string; url: string; storagePath: string; mimeType: string; sizeBytes?: number; sortOrder?: number }) {
    const asset = await this.businessProfiles.addMediaAsset(cookieHeader, id, {
      entityType: 'business',
      entityId: id,
      assetType: body.assetType as 'logo' | 'cover' | 'gallery' | 'profile_image' | 'service_image',
      url: body.url,
      storagePath: body.storagePath,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes ?? 0,
      sortOrder: body.sortOrder ?? 0
    });
    return { asset };
  }

  @Get(':id/media')
  async getMedia(@Param('id') id: string, @Query('assetType') assetType?: string) {
    return { assets: await this.businessProfiles.getMediaAssets('business', id, assetType) };
  }

  @Delete(':id/media/:assetId')
  async deleteMedia(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Param('assetId') assetId: string) {
    await this.businessProfiles.deleteMediaAsset(cookieHeader, id, assetId);
    return { status: 'deleted' };
  }

  // --- Opening Hours ---
  @Post(':id/opening-hours')
  async setOpeningHours(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: { hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed?: boolean }> }) {
    const hours = (body.hours ?? []).map((h) => ({
      businessProfileId: id,
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isClosed: h.isClosed ?? false
    }));
    return { hours: await this.businessProfiles.setOpeningHours(cookieHeader, id, hours) };
  }

  @Get(':id/opening-hours')
  async getOpeningHours(@Param('id') id: string) {
    return { hours: await this.businessProfiles.getOpeningHours(id) };
  }

  // --- Branches ---
  @Post(':id/branches')
  async addBranch(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: { nameAr: string; nameEn?: string; addressAr?: string; phone?: string; cityCode: string; lat?: number; lng?: number; isMain?: boolean }) {
    return { branch: await this.businessProfiles.addBranch(cookieHeader, id, { ...body, isMain: body.isMain ?? false }) };
  }

  @Get(':id/branches')
  async getBranches(@Param('id') id: string) {
    return { branches: await this.businessProfiles.getBranches(id) };
  }

  // --- Social Links ---
  @Post(':id/social-links')
  async setSocialLink(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: { platform: string; url: string }) {
    return { link: await this.businessProfiles.setSocialLink(cookieHeader, id, body.platform, body.url) };
  }

  @Get(':id/social-links')
  async getSocialLinks(@Param('id') id: string) {
    return { links: await this.businessProfiles.getSocialLinks(id) };
  }

  @Delete(':id/social-links/:linkId')
  async deleteSocialLink(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Param('linkId') linkId: string) {
    await this.businessProfiles.deleteSocialLink(cookieHeader, id, linkId);
    return { status: 'deleted' };
  }

  // --- Verification ---
  @Post(':id/verification-request')
  async requestVerification(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { request: await this.businessProfiles.requestVerification(cookieHeader, 'business', id) };
  }

  @Get(':id/verification-status')
  async getVerificationStatus(@Param('id') id: string) {
    return { status: await this.businessProfiles.getVerificationStatus('business', id) };
  }

  @Get(':id/trust-history')
  async getTrustHistory(@Param('id') id: string) {
    return { history: await this.businessProfiles.getTrustHistory('business', id) };
  }

  @Post(':id/submit')
  async submit(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { business: await this.businessProfiles.submitForReview(cookieHeader, id) };
  }

  @Post(':id/approve')
  async approve(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { business: await this.businessProfiles.approveVerification(cookieHeader, id) };
  }

  @Post(':id/moderation/approve')
  async approveModeration(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { business: await this.businessProfiles.approveModeration(cookieHeader, id) };
  }

  @Post(':id/moderation/reject')
  async rejectModeration(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: { reason: string }) {
    return { business: await this.businessProfiles.rejectModeration(cookieHeader, id, body.reason) };
  }

  @Post(':id/suspend')
  async suspend(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: { reason?: string }) {
    return { business: await this.businessProfiles.suspendBusiness(cookieHeader, id, body.reason ?? '') };
  }

  @Post(':id/reactivate')
  async reactivate(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { business: await this.businessProfiles.reactivateBusiness(cookieHeader, id) };
  }
}

