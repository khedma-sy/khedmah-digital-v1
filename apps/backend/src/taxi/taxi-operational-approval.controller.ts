import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { TaxiOperationalApprovalService } from './taxi-operational-approval.service';

@Controller('taxi-operational-approvals')
export class TaxiOperationalApprovalController {
  constructor(private readonly approvals: TaxiOperationalApprovalService) {}

  @Get('candidates')
  candidates(@Headers('cookie') cookie: string | undefined) {
    return this.approvals.listCandidates(cookie);
  }

  @Get(':businessProfileId')
  status(@Headers('cookie') cookie: string | undefined, @Param('businessProfileId') businessProfileId: string) {
    return this.approvals.status(cookie, businessProfileId);
  }

  @Post(':businessProfileId/approve')
  approve(
    @Headers('cookie') cookie: string | undefined,
    @Param('businessProfileId') businessProfileId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.approvals.approve(cookie, businessProfileId, body ?? {});
  }

  @Post(':businessProfileId/suspend')
  suspend(
    @Headers('cookie') cookie: string | undefined,
    @Param('businessProfileId') businessProfileId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.approvals.restrict(cookie, businessProfileId, 'suspended', body ?? {});
  }

  @Post(':businessProfileId/revoke')
  revoke(
    @Headers('cookie') cookie: string | undefined,
    @Param('businessProfileId') businessProfileId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.approvals.restrict(cookie, businessProfileId, 'revoked', body ?? {});
  }
}
