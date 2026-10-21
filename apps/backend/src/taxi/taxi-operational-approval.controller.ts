import { Body, Controller, Get, Header, Headers, Param, Post } from '@nestjs/common';
import { TaxiOperationalApprovalService } from './taxi-operational-approval.service';

@Controller('taxi-operational-approvals')
export class TaxiOperationalApprovalController {
  constructor(private readonly approvals: TaxiOperationalApprovalService) {}

  @Get('candidates')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  candidates(@Headers('cookie') cookie: string | undefined) {
    return this.approvals.listCandidates(cookie);
  }

  @Get(':businessProfileId')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  status(@Headers('cookie') cookie: string | undefined, @Param('businessProfileId') businessProfileId: string) {
    return this.approvals.status(cookie, businessProfileId);
  }

  @Post(':businessProfileId/approve')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  approve(
    @Headers('cookie') cookie: string | undefined,
    @Param('businessProfileId') businessProfileId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.approvals.approve(cookie, businessProfileId, body ?? {});
  }

  @Post(':businessProfileId/suspend')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  suspend(
    @Headers('cookie') cookie: string | undefined,
    @Param('businessProfileId') businessProfileId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.approvals.restrict(cookie, businessProfileId, 'suspended', body ?? {});
  }

  @Post(':businessProfileId/revoke')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  revoke(
    @Headers('cookie') cookie: string | undefined,
    @Param('businessProfileId') businessProfileId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.approvals.restrict(cookie, businessProfileId, 'revoked', body ?? {});
  }
}
