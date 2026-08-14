import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { SubmitContactInquiryRequest, TrackContactClickRequest } from './dto/contact.dto';

@Controller('businesses/:businessProfileId')
export class ContactController {
  constructor(@Inject(ContactService) private readonly contactService: ContactService) {}

  @Post('inquiries')
  async submitInquiry(
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('businessProfileId') businessProfileId: string,
    @Body() body: SubmitContactInquiryRequest
  ) {
    return { inquiry: await this.contactService.submitInquiry(cookieHeader, { type: 'business', id: businessProfileId }, body, idempotencyKey) };
  }

  @Get('inquiries')
  async listReceivedInquiries(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('businessProfileId') businessProfileId: string
  ) {
    return { inquiries: await this.contactService.listReceivedInquiries(cookieHeader, businessProfileId) };
  }

  @Post('contact-click')
  async trackContactClick(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('businessProfileId') businessProfileId: string,
    @Body() body: TrackContactClickRequest
  ) {
    return { contactAction: await this.contactService.trackContactClick(cookieHeader, businessProfileId, body) };
  }
}

@Controller('professionals/:professionalProfileId')
export class ProfessionalContactController {
  constructor(@Inject(ContactService) private readonly contactService: ContactService) {}

  @Post('inquiries')
  async submitInquiry(
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('professionalProfileId') professionalProfileId: string,
    @Body() body: SubmitContactInquiryRequest
  ) {
    return { inquiry: await this.contactService.submitInquiry(cookieHeader, { type: 'professional', id: professionalProfileId }, body, idempotencyKey) };
  }

  @Get('inquiries')
  async listReceivedInquiries(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('professionalProfileId') professionalProfileId: string
  ) {
    return { inquiries: await this.contactService.listReceivedProfessionalInquiries(cookieHeader, professionalProfileId) };
  }
}
