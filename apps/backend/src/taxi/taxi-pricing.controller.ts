import { Body, Controller, Get, Header, Headers, Inject, Post, Query } from '@nestjs/common';
import { readSessionToken } from '../identity/session-cookie';
import { TaxiPricingAdminService } from './taxi-pricing.service';

@Controller('taxi/admin/pricing')
export class TaxiPricingAdminController {
  constructor(@Inject(TaxiPricingAdminService) private readonly pricing: TaxiPricingAdminService) {}

  @Get('current')
  @Header('Cache-Control', 'private, no-store')
  current(@Headers('cookie') cookie: string | undefined, @Query('zone') zone: string | undefined) {
    return this.pricing.current(readSessionToken(cookie), zone);
  }

  @Get('history')
  @Header('Cache-Control', 'private, no-store')
  history(@Headers('cookie') cookie: string | undefined, @Query('zone') zone: string | undefined) {
    return this.pricing.history(readSessionToken(cookie), zone);
  }

  @Post('simulate')
  @Header('Cache-Control', 'private, no-store')
  simulate(@Headers('cookie') cookie: string | undefined, @Body() body: unknown) {
    return this.pricing.simulate(readSessionToken(cookie), body);
  }

  @Post('revisions')
  @Header('Cache-Control', 'private, no-store')
  replace(@Headers('cookie') cookie: string | undefined, @Body() body: unknown) {
    return this.pricing.replaceActive(readSessionToken(cookie), body);
  }
}
