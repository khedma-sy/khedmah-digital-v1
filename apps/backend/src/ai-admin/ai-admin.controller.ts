import { Body, Controller, Get, Headers, Inject, Post } from '@nestjs/common';
import { AiAdminService } from './ai-admin.service';
import { SetAiAdminEnabledRequest } from './dto/ai-admin.dto';

@Controller('admin/ai-admin')
export class AiAdminController {
  constructor(@Inject(AiAdminService) private readonly service: AiAdminService) {}

  @Get('status')
  async status(@Headers('cookie') cookie: string | undefined) {
    return { aiAdmin: await this.service.status(cookie) };
  }

  @Post('state')
  async setState(@Headers('cookie') cookie: string | undefined, @Body() body: SetAiAdminEnabledRequest) {
    return { aiAdmin: await this.service.setEnabled(cookie, body.enabled) };
  }
}
