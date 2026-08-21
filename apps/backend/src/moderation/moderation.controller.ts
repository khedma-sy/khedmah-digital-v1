import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { BusinessProfileService } from '../business-profiles/business-profile.service';
import { ProfessionalProfileService } from '../professional-profiles/professional-profile.service';

@Controller('admin/moderation')
export class ModerationController {
  constructor(
    @Inject(BusinessProfileService) private readonly businesses: BusinessProfileService,
    @Inject(ProfessionalProfileService) private readonly professionals: ProfessionalProfileService
  ) {}

  @Get('pending')
  async listPending(@Headers('cookie') cookieHeader: string | undefined) {
    const [businesses, professionals] = await Promise.all([
      this.businesses.listPendingModeration(cookieHeader),
      this.professionals.listPendingModeration(cookieHeader)
    ]);
    return { businesses, professionals };
  }
}
