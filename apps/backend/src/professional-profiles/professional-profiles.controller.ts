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
}
