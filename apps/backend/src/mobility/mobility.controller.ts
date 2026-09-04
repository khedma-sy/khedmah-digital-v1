import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { MobilityService } from './mobility.service';

@Controller('mobility')
export class MobilityController {
  constructor(@Inject(MobilityService) private readonly mobility: MobilityService) {}

  @Post('requests')
  async create(@Headers('cookie') cookie: string | undefined, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() body: Record<string, unknown>) {
    return { request: await this.mobility.create(cookie, body, idempotencyKey) };
  }

  @Get('requests/mine')
  async mine(@Headers('cookie') cookie: string | undefined) { return { requests: await this.mobility.listMine(cookie) }; }

  @Get('provider/requests')
  async provider(@Headers('cookie') cookie: string | undefined, @Query('businessId') businessId: string) {
    return { requests: await this.mobility.listForProvider(cookie, businessId) };
  }

  @Get('fare-policy')
  async farePolicy(@Query('serviceType') serviceType: string) { return { policy: await this.mobility.farePolicy(serviceType) }; }

  @Put('admin/fare-policy')
  async updateFarePolicy(@Headers('cookie') cookie: string | undefined, @Body() body: Record<string, unknown>) {
    return { policy: await this.mobility.updateFarePolicy(cookie, body) };
  }

  @Patch('requests/:id/status')
  async transition(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return { request: await this.mobility.transition(cookie, id, body) };
  }
}
