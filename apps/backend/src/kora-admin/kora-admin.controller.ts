import { Body, Controller, Get, Headers, Inject, Post } from '@nestjs/common';
import { AutopsyRequest, DraftAdminTaskRequest, EvaluateUiObservationRequest, KillCriticRequest } from './dto/kora-admin.dto';
import { KoraAdminService } from './kora-admin.service';

@Controller('admin/kora')
export class KoraAdminController {
  constructor(@Inject(KoraAdminService) private readonly service: KoraAdminService) {}

  @Get('metrics')
  async metrics(@Headers('cookie') cookie: string | undefined) {
    return this.service.readMetrics(cookie);
  }

  @Get('ui-failures')
  async uiFailures(@Headers('cookie') cookie: string | undefined) {
    return this.service.uiChecklist(cookie);
  }

  @Post('ui-failures/evaluate')
  async evaluateUiFailure(@Headers('cookie') cookie: string | undefined, @Body() body: EvaluateUiObservationRequest) {
    return this.service.evaluateUiObservation(cookie, body);
  }

  @Get('anomalies')
  async anomalies(@Headers('cookie') cookie: string | undefined) {
    return this.service.reviewOperationalAnomalies(cookie);
  }

  @Post('tasks/draft')
  async draftTask(@Headers('cookie') cookie: string | undefined, @Body() body: DraftAdminTaskRequest) {
    return this.service.draftAdminTask(cookie, body);
  }

  @Get('executive')
  async executive(@Headers('cookie') cookie: string | undefined) {
    return this.service.executive(cookie);
  }

  @Get('expose')
  async expose(@Headers('cookie') cookie: string | undefined) {
    return this.service.expose(cookie);
  }

  @Post('killcritic')
  async killCritic(@Headers('cookie') cookie: string | undefined, @Body() body: KillCriticRequest) {
    return this.service.killCritic(cookie, body);
  }

  @Post('autopsy')
  async autopsy(@Headers('cookie') cookie: string | undefined, @Body() body: AutopsyRequest) {
    return this.service.autopsy(cookie, body);
  }
}
