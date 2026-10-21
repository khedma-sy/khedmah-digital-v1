import { Body, Controller, Get, Header, Headers, Inject, Param, Post } from '@nestjs/common';
import { BusinessProfileService } from '../business-profiles/business-profile.service';
import { ProfessionalProfileService } from '../professional-profiles/professional-profile.service';
import { VerificationReviewService } from './verification-review.service';

@Controller('admin/moderation')
export class ModerationController {
  constructor(
    @Inject(BusinessProfileService) private readonly businesses: BusinessProfileService,
    @Inject(ProfessionalProfileService) private readonly professionals: ProfessionalProfileService,
    @Inject(VerificationReviewService) private readonly verification: VerificationReviewService
  ) {}

  @Get('pending')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async listPending(@Headers('cookie') cookieHeader: string | undefined) {
    const [businesses, professionals] = await Promise.all([
      this.businesses.listPendingModeration(cookieHeader),
      this.professionals.listPendingModeration(cookieHeader)
    ]);
    return { businesses, professionals };
  }

  @Get('verification/pending')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async listPendingVerification(@Headers('cookie') cookieHeader: string | undefined) {
    return { requests: await this.verification.listPending(cookieHeader) };
  }

  @Post('verification/:requestId/approve')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async approveVerification(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('requestId') requestId: string,
    @Body() body: { expectedRevision?: unknown; notes?: unknown } | null
  ) {
    return { request: await this.verification.approve(cookieHeader, requestId, body?.expectedRevision, body?.notes) };
  }

  @Post('verification/:requestId/reject')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async rejectVerification(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('requestId') requestId: string,
    @Body() body: { expectedRevision?: unknown; notes?: unknown } | null
  ) {
    return { request: await this.verification.reject(cookieHeader, requestId, body?.expectedRevision, body?.notes) };
  }
}
