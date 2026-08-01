import { Body, Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { SubmitContactInquiryRequest, TrackContactClickRequest } from './dto/contact.dto';

@Controller('businesses/:businessProfileId')
export class ContactController {
  constructor(@Inject(ContactService) private readonly contactService: ContactService) {}

  @Post('inquiries')
  async submitInquiry(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('businessProfileId') businessProfileId: string,
    @Body() body: SubmitContactInquiryRequest
  ) {
    return { inquiry: await this.contactService.submitInquiry(cookieHeader, businessProfileId, body) };
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
