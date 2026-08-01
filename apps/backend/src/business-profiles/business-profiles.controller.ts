import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
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
}
